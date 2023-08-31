# slycooper-rtgg
A racetime.gg bot for the Sly Cooper speedrunning community.

# Requirements
* Node.JS v18.17.1 or newer
* NPM

# Features
* Monitor a category on racetime.gg and check for new races
* Connect to the chat of a new race
* Use `!seed` to roll a numeric seed between 10 and 13 characters
* Send a seed URL to the chat and set it as race room info

# Setup
* Rename `config.json.example` to `config.json`
* Get a racetime.gg bot client id and secret via the `Manage` menu of your category
* Fill in the required config values in `config.json`
  * If `rtgg-game-track-categories` is left empty, all categories will be tracked.
  * If you do not want the bot to track custom races, set `rtgg-game-track-custom` to `false`
  * If you want the bot to log any important action, set `verbose-logging` to `true`
* Install the required packages via `npm install`
* Run the app via `npm start`
