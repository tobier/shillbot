const Discord = require('discord.js');
const client = new Discord.Client();

const config = require('./config.json');

const Datastore = require('nedb');
const db = new Datastore({ filename : config.database.path, autoload : true });

client.once('ready', () => {
	console.log('Ready!');
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
	db.findOne({ user : message.author.id }, (err, doc) => {
		if (err) {
			console.error(err);
			return;
		}

		if (doc) {
			message.author.send(`Already registed with Twitch id: ${doc.twitchId}`);
			return;
		}

		const twitchId = args.shift();
		const newDoc = {
			user : message.author.id,
			twitchId : twitchId,
		};
		db.insert(newDoc, (err, insertedDoc) => {
			if (err) {
				console.error(err);
				return;
			}
			message.author.send(`Will now shill for: ${insertedDoc.twitchId}`);
		});
	});
});

client.login(config.discord.token);