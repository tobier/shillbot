const Discord = require('discord.js');
const client = new Discord.Client();

const config = require('./config.json');

const TwitchClient = require('twitch').default;
const WebHookListener = require('twitch-webhooks').default;

const Datastore = require('nedb');
const db = new Datastore({ filename: config.database.path, autoload: true });

// TODO: only works with one guild per user
function streamChangeCallback(stream) {
  if (!stream) return;

  db.findOne({ twitchId: stream.userId }, async (err, doc) => {
    if (err) {
      console.error(err);
      return;
    }
    const guild = client.guilds.find(gld => gld.id == doc.guild);
    // TODO: if this happens then the database has users from a server the bot isn't on
    if (!guild) return;

    const guildChannel = guild.channels.find(chn => chn.name == config.discord.channel);
    if (!guildChannel) return;

    const guildUser = guild.members.find(user => user.user.id == doc.user);
    if (!guildUser) return;

    const twitchChannel = await client.twitch.kraken.channels.getChannel(stream.userId);
    if (!twitchChannel) return;

    const game = await stream.getGame();
    const artworkUrl = game.boxArtUrl.replace('{width}', 144).replace('{height}', 192);
    const shill = new Discord.RichEmbed()
      .setAuthor(guildUser.displayName, guildUser.user.avatarURL, twitchChannel.url)
      .setColor('#0099ff')
      .setTitle(stream.title)
      .setDescription(game.name)
      .setThumbnail(artworkUrl)
      .setFooter(twitchChannel.url);

    guildChannel.send(`${stream.userDisplayName} just went live with title: ${stream.title}`, shill).then(() => {
      console.log(`Shilled for ${stream.userDisplayName}`);
    });
  });
}

client.once('ready', async () => {
  client.twitch = TwitchClient.withClientCredentials(config.twitch.id, config.twitch.secret);
  client.listener = await WebHookListener.create(client.twitch, config.twitch.webhooks);
  client.listener.listen();
  db.find({}, (err, docs) => {
    if (err) throw err;
    if (docs) {
      docs.forEach(async doc => {
        await client.listener.subscribeToStreamChanges(doc.twitchId, streamChangeCallback);
        console.debug(`Listening to ${doc.user} with Twitch id ${doc.twitchId} for stream events`);
      });
    }
  });
});

client.on('message', message => {
  // Don't care about non-prefix messages or bot authors
  if (!message.content.startsWith(config.discord.prefix) || message.author.bot) return;

  // We only care about the add command that takes one argument (the Twitch username)
  const args = message.content.slice(config.discord.prefix.length).split(/ +/);
  if (args.length != 2) return;

  const command = args.shift().toLowerCase();
  if (command != 'add') return;

  // Check if already added to the database
  db.findOne({ user: message.author.id, guild: message.guild.id }, async (err, doc) => {
    if (err) {
      console.error(err);
      return;
    }

    if (doc) {
      message.author.send('You already have registered with me!');
      return;
    }

    // Verify that a valid twitch user was provided
    const providedUserName = args.shift();
    const twitchUser = await client.twitch.helix.users.getUserByName(providedUserName);
    if (!twitchUser) {
      message.author.send(`Couldn't find a Twitch user with the name: ${providedUserName}`);
      return;
    }

    const newDoc = {
      user: message.author.id,
      guild: message.guild.id,
      twitchId: twitchUser.id,
    };
    db.insert(newDoc, async (err, insertedDoc) => {
      if (err) {
        console.error(err);
        return;
      }
      await client.listener.subscribeToStreamChanges(insertedDoc.twitchId, streamChangeCallback);
      console.debug(`Listening to ${insertedDoc.user} with Twitch id ${insertedDoc.twitchId} for stream events`);
      message.author.send(`Will now shill for: ${twitchUser.name}`);
    });
  });
});

client.login(config.discord.token);