/**
 * Created by rafaelkallis on 10.10.16.
 */
require('log-timestamp');
var express = require('express');
var app = express();
var DB = require('./db').DB;
var Github = require('./github').Github;
var Crawler = require('./crawler').Crawler;
var uuid = require('node-uuid');

const pg_config = {
    user: process.env.POSTGRES_USERNAME || 'postgres',
    database: process.env.POSTGRES_DATABASE || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    max: 10,
    idleTimeoutMillis: 2000
};

const auth = {
    user: process.env.GITHUB_USER,
    key: process.env.GITHUB_KEY
};

const fqdn = process.env.FQDN || 'localhost';

const uuid_ = uuid.v4();
const db = new DB(pg_config, uuid_);
const github = new Github(auth, uuid_);

let crawler = new Crawler(github, db, uuid_);

setTimeout(() => {
    console.log('starting');
    crawler.start();
}, 2000);

