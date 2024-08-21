const { REST, Routes } = require('discord.js');

const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
  {
    name: 'members',
    description: 'Retrieves the IDs of members in the current channel',
  },
];

const rest = new REST({ version: '10' }).setToken('ODI5NzQxMzg2NTU4ODY1NTEw.GIRMj6.Ca6C5Nm7CsJ1xfxcyAak8qNJjMF-71R6_pR0Js');

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands('829741386558865510'), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
