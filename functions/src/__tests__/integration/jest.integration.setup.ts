/**
 * Jest setupFile for integration tests.
 * Executed by Jest BEFORE any test modules are loaded,
 * ensuring env vars are set before firebase-admin reads them.
 */
process.env.FIREBASE_DATABASE_EMULATOR_HOST = 'localhost:9000';
process.env.GCLOUD_PROJECT = 'quikdarts';
