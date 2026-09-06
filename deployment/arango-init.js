// Idempotent ArangoDB bootstrap, executed with arangosh (as root) by the
// `arango-init` service in docker-compose.backend.yml.
//
// Creates the application database, the application user with rw access and
// the collections the backend expects. Safe to run on every `compose up`.
//
// Configuration comes from environment variables (see .env.example).
/* global db, require, print */

const users = require('@arangodb/users');

// ArangoDB's JS runtime exposes environment variables via the internal module.
const env = require('internal').env;
const dbName = env.ARANGO_DATABASE || 'track-planner';
const appUser = env.ARANGO_USER || 'track-planner';
const appPass = env.ARANGO_PASSWORD || 'track-planner';
const collections = [
  'music',
  'playlists',
  'moderation_texts',
  'moderation_categories',
  'genres',
];

db._useDatabase('_system');

if (db._databases().indexOf(dbName) === -1) {
  db._createDatabase(dbName, {}, [
    { username: appUser, passwd: appPass, active: true },
  ]);
  print(`Database '${dbName}' created with user '${appUser}'.`);
} else {
  print(`Database '${dbName}' already exists.`);
}

if (!users.exists(appUser)) {
  users.save(appUser, appPass, true);
  print(`User '${appUser}' created.`);
}
users.grantDatabase(appUser, dbName, 'rw');
users.grantCollection(appUser, dbName, '*', 'rw');

db._useDatabase(dbName);
for (const name of collections) {
  if (db._collection(name) === null) {
    db._create(name);
    print(`Collection '${name}' created.`);
  } else {
    print(`Collection '${name}' already exists.`);
  }
}

print('ArangoDB setup complete.');
