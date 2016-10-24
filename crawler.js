/**
 * Created by rafaelkallis on 18.10.16.
 */
var async = require('async');

module.exports = {

    Crawler: function (github, db, uuid = 0) {

        var run = false;
        let current_task = null;
        let stop_callback = () => ({});

        this.start = function () {
            run = true;
            let attempts = 0;

            async.whilst(() => run, (callback) =>
                db.tasks.next((err, task) => {
                    let exp_backoff_callback = () => setTimeout(callback, 500 * Math.pow(2, ++attempts));
                    if (err == 'no_tasks') {
                        console.log('no tasks');
                        exp_backoff_callback();
                    } else if (!err) {
                        let done_callback = (err) => (attempts = 0) || err ? callback() : db.tasks.done(task.name, task.payload, (err) => callback());
                        current_task = task;
                        switch (task.name) {
                            case "rep":
                                console.log(`repository ${task.payload}`);
                                this.repository(task.payload, done_callback);
                                break;
                            case "str":
                                console.log(`stargazers ${task.payload}`);
                                this.stargazers(task.payload, done_callback);
                                break;
                            case "sub":
                                console.log(`subscribers ${task.payload}`);
                                this.subscribers(task.payload, done_callback);
                                break;
                            case "com":
                                console.log(`commits ${task.payload}`);
                                this.commits(task.payload, done_callback);
                                break;
                            case "usr":
                                console.log(`user ${task.payload}`);
                                this.users(task.payload, done_callback);
                                break;
                            case "fli":
                                console.log(`following ${task.payload}`);
                                this.following(task.payload, done_callback);
                                break;
                            case "fle":
                                console.log(`followers ${task.payload}`);
                                this.followers(task.payload, done_callback);
                                break;
                            default:
                                exp_backoff_callback();
                                break;
                        }
                    } else {
                        console.error(err);
                        exp_backoff_callback();
                    }
                }, stop_callback)
            );

            this.stop = function (callback = () => ({})) {
                stop_callback = callback();
                run = false;
            };

            this.status = function () {
                return {
                    uuid: uuid,
                    idle: !run,
                    task: current_task
                };
            };

            this.repository = function (repository_name, callback) {
                async.waterfall([
                        (callback) => github.repository.get(repository_name, callback),
                        (repository, callback) => callback(null, [repository.id, repository.full_name, repository.owner, repository.forks_count, repository.stargazers_count, repository.subscribers_count, repository.created_at.match(/\d\d\d\d-\d\d-\d\d/g)]),
                        (repository, callback) => db.repository.persist(repository, callback),
                        (callback) => db.tasks.stargazers.persist(repository_name, callback),
                        (callback) => db.tasks.subscribers.persist(repository_name, callback),
                        (callback) => db.tasks.commits.persist(repository_name, callback)
                    ],
                    callback
                );
            };

            this.stargazers = function (repository_name, callback) {
                async.waterfall([
                    (callback) => github.repository.stargazers.get(repository_name, callback),
                    (stargazers, callback) => db.tasks.users.persist(stargazers.map((stargazer) => stargazer.login), (err) => callback(err, stargazers)),
                    (stargazers, callback) => callback(null, stargazers.map((stargazer) => [repository_name, stargazer.login])),
                    (stargazers, callback) => db.repository.stargazers.persist(stargazers, callback),
                ], callback);
            };

            this.subscribers = function (repository_name, callback) {
                async.waterfall([
                    (callback) => github.repository.subscribers.get(repository_name, callback),
                    (subscribers, callback) => db.tasks.users.persist(subscribers.map((subscriber) => subscriber.login), (err) => callback(err, subscribers)),
                    (subscribers, callback) => callback(null, subscribers.map((subscriber) => [repository_name, subscriber.login])),
                    (subscribers, callback) => db.repository.subscribers.persist(subscribers, callback),
                ], callback);
            };

            this.commits = function (repository_name, callback) {
                async.waterfall([
                    (callback) => github.repository.commits.get(repository_name, callback),
                    (commits, callback) => db.tasks.users.persist(commits.map((commit) => commit.author_login).filter((author_login) => author_login), (err) => callback(err, commits)),
                    (commits, callback) => callback(null, commits.map((commit) => [repository_name, commit.author_login, commit.author_name, commit.author_email, commit.n_commits])),
                    (commits, callback) => db.repository.commits.persist(commits, callback),
                ], callback);
            };

            this.users = function (login, callback) {
                async.waterfall([
                    (callback) => github.users.get(login, callback),
                    (user, callback) => callback(null, [user.id, user.login, user.name, user.location, user.email, user.public_repos, user.followers_count, user.following_count, user.created_at.match(/\d\d\d\d-\d\d-\d\d/g)]),
                    (user, callback) => db.users.persist(user, callback),
                    (callback) => db.tasks.followers.persist(login, callback),
                    (callback) => db.tasks.following.persist(login, callback)
                ], callback);
            };

            this.followers = function (login, callback) {
                async.waterfall([
                    (callback) => github.users.followers.get(login, callback),
                    // (followers, callback) => db.tasks.users.persist(followers.map((follower) => follower.login), (err) => callback(err, followers)),
                    (followers, callback) => callback(null, followers.map((follower) => [follower.login, login])),
                    (followers, callback) => db.users.followers.persist(followers, callback),
                ], callback);
            };

            this.following = function (login, callback) {
                async.waterfall([
                    (callback) => github.users.following.get(login, callback),
                    // (following, callback) => db.tasks.users.persist(following.map((_following) => _following.login), (err) => callback(err, following)),
                    (following, callback) => callback(null, following.map((_following) => [login, _following.follows])),
                    (followers, callback) => db.users.followers.persist(followers, callback),
                ], callback);
            };
        }
    }
};