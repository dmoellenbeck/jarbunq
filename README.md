# bunq Assistant (ALPHA VERSION)

The bunq Assistant is a Node.js / TypeScript based service to automate tasks on your bunq accounts. It's not ready for prime time yet, but a fully working version is expected soon (first week of September).

**This is a personal "weekend-project", and NOT an official bunq software.**

## Features

- Amazon.de: transfer order value from the Main account to the Amazon account based on order confirmation emails
- LBB Amazon: make sure the Amazon account has enough funds to pay the LBB Amazon credit card bills
- Auto save money for kilometers and elevation ridden on Strava, daily or weekly
- Transfers can be fully automated, or as draft (with approval needed by the owner)
- Everything logged to the console by default, easily customized to log elsewhere
- Email notifications of failed actions and payments
- File based, non-frills JSON database

## Planned features

- Web frontend to configure the settings and view status / logs
- Make a "generic" email action that can be fully configured via rules / settings

## Installing

Clone this repo:

    $ git clone git@github.com:igoramadas/bunq-assistant.git

## Settings

The bunq Assistant is using [setmeup](https://github.com/igoramadas/setmeup) to handle its settings, which are defined on the following files:

- **settings.json** General settings shared accross all environments
- **settings.development.json** Development and test settings only
- **settings.production.json** Production settings only
- **settings.private.json** Your private settings - this is where you'll make 99% of your customizations

Please note that the `settings.private.json` file is NOT synced to GIT. A `settings.private.json.sample` is provided. For a more detailed info on how to define your private settings please check the [wiki](https://github.com/igoramadas/bunq-assistant/wiki/Private-settings).

## Database

The bunq Assistant stores all its actions and payments data on the file `database.json`, on the app's root, which is created and managed automatically by the server. Please do not edit this file manually unless you're 100% sure of what you're doing.

## Running the server

Please make sure you have Node.js 10.0 or superior installed.

To run on your local machine you can do it via make:

    $ make run

Don't have make or prefer doing things manually? Then:

    $ tsc
    $ npm index.js

During startup the service will check for all the required settings and alert (or possibly quit) if something is missing.

## Why?

The idea came up once I decided to automate some of my bike related savings. I usually spare some money every month for the eventual replacement of chains, cassette, cables and other wear-prone parts. But it would be much cooler if I could do this automatically and based on my actual mileage, insead of a fixed monthly amount :-)

Amazon emails came next. I have an Amazon credit card used exclusively on Amazon, so whenever I purchase something, it would be great if the order amount could be moved to an account dedicated for the credit card payments.

Please note that although this project is open-source and relatively simple to customize to your needs, I am not interested in making it a full-fledged platform for bunq automations. If that's you cup of tea, I suggest you try the great [bunq2IFTTT](https://github.com/woudt/bunq2ifttt/).

And a big **thank you** to all the open-source warriors that are responsible for the libraries used by this project.

## Security

Security is a top priority on this project. Hell, we're dealing with money, and no one wants to wake up on a lovely sunny morning to realise his bank accounts have been leaking cash. So what do I do to make sure this won't happen?

- First and foremost: everything is open source, so no black boxes
- Your actual bunq credentials are not known to the service, as it uses OAuth2
- No logging of credentials or tokens
- Regular security scans on the dependencies - mostly via `$ npm audit`

## Bugs or suggestions?

Post it on the [issue tracker](https://github.com/igoramadas/bunq-assistant/issues).
