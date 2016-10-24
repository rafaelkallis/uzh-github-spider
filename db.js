/**
 * Created by rafaelkallis on 17.10.16.
 */
var Pool = require('pg').Pool;
var async = require('async');

module.exports = {

    DB: function (pg_config, uuid, init_callback = ()=> ({})) {
        let pool = new Pool(pg_config);
        async.waterfall([
            (callback) => pool.connect(callback),
            (client, done, callback) => client.query(user_table_create, [], (err) => callback(err, client, done)),
            (client, done, callback) => client.query(follower_table_create, [], (err) => callback(err, client, done)),
            (client, done, callback) => client.query(repository_table_create, [], (err) => callback(err, client, done)),
            (client, done, callback) => client.query(stargazer_table_create, [], (err) => callback(err, client, done)),
            (client, done, callback) => client.query(subscriber_table_create, [], (err) => callback(err, client, done)),
            (client, done, callback) => client.query(commit_table_create, [], (err) => callback(err, client, done)),
            (client, done, callback) => client.query(tasks_table_create, [], (err) => callback(err, done)),
            (done, callback) => done() || callback(null)
        ], init_callback);

        this.users = {
            persist: function (user, callback) {
                persist_one_template(user, user_table_name, callback);
            },
            followers: {
                persist: function (followers, callback) {
                    persist_list_template(followers, follower_table_name, callback);
                }
            }
        };

        this.repository = {
            persist: function (repository, callback) {
                persist_one_template(repository, repository_table_name, callback);
            },
            stargazers: {
                persist: function (stargazers, callback) {
                    persist_list_template(stargazers, stargazer_table_name, callback);
                }
            },
            subscribers: {
                persist: function (subscribers, callback) {
                    persist_list_template(subscribers, subscriber_table_name, callback);
                }
            },
            commits: {
                persist: function (commits, callback) {
                    persist_list_template(commits, commit_table_name, callback);
                }
            }
        };

        this.tasks = {
            next: function (callback) {
                pool.connect((err, client, done) => err ? callback(err) : async.waterfall([
                        (callback) => client.query(`BEGIN;`, (err) => callback(err)),
                        (callback) => client.query(`LOCK TABLE ${tasks_table_name} IN ACCESS EXCLUSIVE MODE;`, (err) => callback(err)),
                        (callback) => client.query(`SELECT * FROM ${tasks_table_name} WHERE assigned IS NULL OR assigned=$1 ORDER BY created_at ASC LIMIT 1;`, [uuid], (err, res) => err ? callback(err) : res.rows.length == 0 ? callback('no_tasks') : callback(err, res.rows[0])),
                        (task, callback) => client.query(`UPDATE ${tasks_table_name} SET assigned=$1 WHERE name=$2 AND payload=$3;`, [uuid, task.name, task.payload], (err) => callback(err, task)),
                        (task, callback) => {
                            task.assigned = uuid;
                            callback(null, task);
                        },
                        (task, callback) => client.query(`COMMIT;`, (err) => callback(err, task))
                    ], (err, task) => err ? client.query(`ROLLBACK;`, (rollback_err) => done() || rollback_err ? callback(rollback_err) : callback(err)) : done() || callback(err, task)
                ));
            },
            done: function (name, payload, callback) {
                pool.connect((err, client, done) => !err && client.query(`DELETE FROM ${tasks_table_name} WHERE name=$1 AND payload=$2`, [name, payload], (err) => done() || callback(err)));
            },
            repository: {
                persist: function (repository_name, callback) {
                    persist_one_template([`rep`, repository_name], tasks_table_name, callback);
                }
            },
            stargazers: {
                persist: function (repository_name, callback) {
                    persist_one_template([`str`, repository_name], tasks_table_name, callback);
                }
            },
            subscribers: {
                persist: function (repository_name, callback) {
                    persist_one_template([`sub`, repository_name], tasks_table_name, callback);
                }
            },
            commits: {
                persist: function (repository_name, callback) {
                    persist_one_template([`com`, repository_name], tasks_table_name, callback);
                }
            },
            users: {
                persist: function (logins, callback) {
                    persist_list_template(logins.map(login => [`usr`, login]), tasks_table_name, callback);
                }
            },
            followers: {
                persist: function (login, callback) {
                    persist_one_template([`fle`, login], tasks_table_name, callback);
                }
            },
            following: {
                persist: function (login, callback) {
                    persist_one_template([`fli`, login], tasks_table_name, callback);
                }
            }
        };

        // let add_tasks_template = (tasks, payload, callback) => pool.connect((err, client, done) => err ? callback(err) : client.query(`INSERT INTO ${tasks_table_name} VALUES ($1,$2);`, [task, payload], (err) => done() || callback(err)));

        // let persist_template = (values, transform, table_name, callback) => async.series(generate_insert_function(values.map((value) => (transform(value))), table_name), (err) => callback(err));

        let persist_list_template = (values_array, table_name, callback) => async.series(generate_insert_function(values_array, table_name), callback);

        let persist_one_template = (values, table_name, callback) => {

            pool.connect((err, client, done) => {
                if (err) {
                    callback(err);
                } else {
                    let placeholders = generatePlaceholders(values.length).placeholder;
                    client.query(`INSERT INTO ${table_name} VALUES ${placeholders} ON CONFLICT DO NOTHING`, values, (err) => {
                        done() || callback(err);
                    });
                }
            });
            // }err ? callback(err) : client.query(`INSERT INTO ${table_name} VALUES ${generatePlaceholders(values.size().placeholder)} ON CONFLICT DO NOTHING`, values, (err) => done() || callback(err)));
        };

        /**
         * Generates an array of functions which execute the insert statement
         * @param array
         * @param table_name
         * @returns {Array|*}
         */
        let generate_insert_function = (array, table_name) => generateInsertStatements(array, table_name).map((query_args) => (callback) => pool.connect((err, client, done) =>client.query(query_args.query, query_args.args, (err) => !err && done() || callback(err))));
    }
};

const max_elements_per_insert_query = 5000;

const user_table_name = `users`;
const user_table_create = `
    CREATE TABLE IF NOT EXISTS ${user_table_name} (
        id VARCHAR(128) UNIQUE NOT NULL,
        login VARCHAR(128) PRIMARY KEY NOT NULL,
        name VARCHAR(128),
        location VARCHAR(128),
        email VARCHAR(128),
        public_repos INTEGER,
        followers_count INTEGER,
        following_count INTEGER,
        created_at DATE
    );`;

const follower_table_name = `followers`;
const follower_table_create = `
    CREATE TABLE IF NOT EXISTS ${follower_table_name} (
        login VARCHAR(128) NOT NULL,
        follows VARCHAR(128) NOT NULL,
        PRIMARY KEY(login, follows)
    );`;

const repository_table_name = `repositories`;
const repository_table_create = `
    CREATE TABLE IF NOT EXISTS ${repository_table_name} (
        id VARCHAR(128) UNIQUE NOT NULL,
        full_name VARCHAR(128) PRIMARY KEY NULL,
        owner VARCHAR(128),
        forks_count INTEGER, 
        stargazers_count INTEGER,
        subscribers_count INTEGER,
        created_at DATE
    );`;

const stargazer_table_name = `stargazers`;
const stargazer_table_create = `
    CREATE TABLE IF NOT EXISTS ${stargazer_table_name} (
        repository_name VARCHAR(128) NOT NULL,
        login VARCHAR(128) NOT NULL,
        PRIMARY KEY (repository_name, login)
    );`;

const subscriber_table_name = `subscribers`;
const subscriber_table_create = `
    CREATE TABLE IF NOT EXISTS ${subscriber_table_name} (
        repository_name VARCHAR(128) NOT NULL,
        login VARCHAR(128) NOT NULL,
        PRIMARY KEY (repository_name, login)
    );`;

const commit_table_name = `commits`;
const commit_table_create = `
    CREATE TABLE IF NOT EXISTS ${commit_table_name} (
        repository_name VARCHAR(128),
        author_login VARCHAR(128),
        author_name VARCHAR(128),
        author_email VARCHAR(128),
        n_commits INTEGER,
        id SERIAL PRIMARY KEY NOT NULL
    );`;

const tasks_table_name = `tasks`;
const tasks_table_create = `
    CREATE TABLE IF NOT EXISTS ${tasks_table_name} (
        name CHAR(3),
        payload VARCHAR(128),
        assigned CHAR(36),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (name, payload)
    );`;

function user_transform(user) {
    return [
        user.id,
        user.login,
        user.name,
        user.location,
        user.email,
        user.public_repos,
        user.followers_count,
        user.following_count,
        user.created_at.replace(/T.*/g, '')
    ];
}

function repository_transform(repository) {
    return [
        repository.id,
        repository.full_name,
        repository.owner,
        repository.forks_count,
        repository.stargazers_count,
        repository.subscribers_count,
        repository.created_at.replace(/T.*/g, '')
    ];
}


/**
 * Generates the SQL insert statements
 * @param tuples
 * @param table_name
 * @returns {Array}
 */
function generateInsertStatements(tuples, table_name) {
    let query_args_array = [];

    let query = [];
    let args = [];
    let chunk_index = 0;
    let chunk_elem_index = 0;
    let placeholder_index = 0;
    while (tuples.length) {
        let tuple = tuples.pop();
        let gen_placeholder_index = generatePlaceholders(tuple.length, placeholder_index);
        let placeholder = gen_placeholder_index.placeholder;
        placeholder_index = gen_placeholder_index.index;
        query.push(placeholder);
        while (tuple.length) {
            args.push(tuple.shift());
        }
        if (++chunk_elem_index == max_elements_per_insert_query || !tuples.length) {
            query_args_array.push({
                query: `INSERT INTO "${table_name}" VALUES ${query.join()} ON CONFLICT DO NOTHING`,
                args: args
            });
            query = [];
            args = [];
            chunk_elem_index = 0;
            ++chunk_index;
            placeholder_index = 0;
        }
    }
    return query_args_array;
}

/**
 * Generates placeholders for insert statements
 * @param size
 * @param index
 * @returns {{placeholder: string, index: *}}
 */
function generatePlaceholders(size, index = 0) {
    let placeholder = [];
    while (size--) {
        placeholder.push(`$${++index}`);
    }
    return {
        placeholder: `(${placeholder.join()})`,
        index: index
    };
}