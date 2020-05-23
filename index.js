const Discord = require('discord.js');
const client = new Discord.Client();

const config = require('./config.json');

const TwitchClient = require('twitch').default;
const WebHookListener = require('twitch-webhooks').default;

const Datastore = require('nedb');
const db = new Datastore({ filename : config.database.path, autoload : true });

client.once('ready', async () => {
	client.twitch = TwitchClient.withClientCredentials(config.twitch.id, config.twitch.secret);
	client.listener = await WebHookListener.create(client.twitch, config.twitch.webhooks);
	client.listener.listen();
	db.find({ }, (err, docs) => {
		if (err) throw err;
		if (docs) {
			docs.forEach(async doc => {
				await client.listener.subscribeToStreamChanges(doc.twitchId, async stream => {
					if (stream) {
						console.log(`${stream.userDisplayName} just went live with title: ${stream.title}`);
					}
					else {
						const user = await client.twitch.helix.users.getUserById(doc.twitchId);
						console.log(`${user.displayName} just went offline`);
					}
				});
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
	db.findOne({ user : message.author.id }, async (err, doc) => {
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
			user : message.author.id,
			twitchId : twitchUser.id,
		};
		db.insert(newDoc, err => {
			if (err) {
				console.error(err);
				return;
			}
			message.author.send(`Will now shill for: ${twitchUser.name}`);
		});
	});
});

client.login(config.discord.token);