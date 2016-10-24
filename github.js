/**
 * Created by rafaelkallis on 19.10.16.
 */
var request = require('request');
var util = require('./utilities');
var async = require('async');

module.exports = {

    Github: function (_auth, _uuid) {
        const auth = _auth;
        const uuid = _uuid;
        const max_user_sample_id = 22800000;

        this.repository = {
            get: function (repository_name, callback) {
                fetch_one_template(`repos/${repository_name}`, repository_transform, callback
                );
            },
            stargazers: {
                get: function (repository_name, callback) {
                    fetch_list_template(`repos/${repository_name}/stargazers`, stargazers_transform, callback);
                }
            },
            subscribers: {
                get: function (repository_name, callback) {
                    fetch_list_template(`repos/${repository_name}/subscribers`, subscribers_transform, callback);
                }
            },
            commits: {
                get: function (repository_name, callback) {
                    fetch_list_template(`repos/${repository_name}/commits`, commits_transform, (err, commits) => err ? callback(err, null) : callback(null, reduce_user_commits(commits)));
                }
            }
        };

        this.users = {
            get: function (login, callback) {
                fetch_one_template(`users/${login}`, user_transform, callback);
            },
            sample: function (callback) {
                sample(`user`, max_user_sample_id, user_transform, callback);
            },
            followers: {
                get: function (login, callback) {
                    fetch_list_template(`users/${login}/followers`, followers_transform, callback);
                }
            },
            following: {
                get: function (login, callback) {
                    fetch_list_template(`users/${login}/following`, following_transform, callback);
                }
            }
        };

        // works only for users
        let sample = (path, max, transform, callback) => request({
                url: `${util.baseURL(auth)}${path}?per_page=1&since=${Math.floor(Math.random() * max)}`,
                headers: {
                    'User-Agent': `uzh-github-spider-${uuid}`
                }
            }, (err, resp, body) =>
                err ? callback(err, null) : callback_on_legal_rate_limit(
                    parseInt(resp.headers['x-ratelimit-remaining']),
                    parseInt(resp.headers['x-ratelimit-reset']),
                    () => callback(null, transform(body))
                )
        );

        let fetch_one_template = (path, transform, callback) => request({
                url: `${util.baseURL(auth)}${path}`,
                headers: {'User-Agent': `uzh-github-spider-${uuid}`}
            }, (err, resp, body) =>
                err ? callback(err) : callback_on_legal_rate_limit(
                    parseInt(resp.headers['x-ratelimit-remaining']),
                    parseInt(resp.headers['x-ratelimit-reset']),
                    () => callback(err, transform(body))
                )
        );

        let fetch_list_template = (path, transform, callback) => {
            let list = [];
            let fetch_q = async.queue((task, task_callback) => task((err, partition) => {
                partition.forEach((element) => list.push(element));
                task_callback(err);
            }));

            let fetch_page = (page, path, transform) => (queue_callback) => request({
                    url: `${util.baseURL(auth)}${path}?per_page=100&page=${page}`,
                    headers: {'User-Agent': `uzh-github-spider-${uuid}`}
                }, (err, resp, body) =>
                    err ? queue_callback(err) : callback_on_legal_rate_limit(
                        parseInt(resp.headers['x-ratelimit-remaining']),
                        parseInt(resp.headers['x-ratelimit-reset']),
                        () => {
                            /rel="last"/.test(resp.headers.link) && fetch_q.push(fetch_page(page + 1, path, transform));
                            queue_callback(null, transform(body));
                        }
                    )
            );

            fetch_q.drain = () => {
                callback(null, list);
            };
            fetch_q.push(fetch_page(1, path, transform));
        };

        let callback_on_legal_rate_limit = function (rate_limit_remaining, rate_limit_reset, callback) {
            if (rate_limit_remaining == 0) {
                let interval = rate_limit_reset * 1000 - new Date().getTime();
                console.log(`rate limit exceeded, resuming fetching in ${interval} ms (${new Date(rate_limit_reset * 1000)})`);
                setTimeout(() => {
                    callback();
                }, interval);
            } else {
                callback();
            }
        };


        let reduce_user_commits = (commits) =>
            util.groupBy(commits, (commit) =>`${commit.author_login ? commit.author_login : commit.author_email}`)
                .map((group) => ({
                    author_login: group[0].author_login,
                    author_name: group[0].author_name,
                    author_email: group[0].author_email,
                    n_commits: group.length
                }));

        let repository_transform = (repository_chunk) => {
            let repository = JSON.parse(repository_chunk);
            return {
                id: repository.id,
                full_name: repository.full_name,
                owner: repository.owner.login,
                forks_count: repository.forks_count,
                stargazers_count: repository.stargazers_count,
                subscribers_count: repository.subscribers_count,
                created_at: repository.created_at
            }
        };

        let stargazers_transform = (stargazers_chunk) => JSON.parse(stargazers_chunk).map(stargazer => ({login: stargazer.login}));

        let subscribers_transform = (subscribers_chunk) => JSON.parse(subscribers_chunk).map(subscriber => ({login: subscriber.login}));

        let commits_transform = (commits_chunk) => JSON.parse(commits_chunk).map(
            (commit) => ({
                author_login: commit.author ? commit.author.login : null,
                author_name: commit.commit.author.name,
                author_email: commit.commit.author.email
            }));

        let user_transform = (user_chunk) => {
            let user = JSON.parse(user_chunk);
            return {
                id: user.id,
                login: user.login,
                name: user.name,
                location: user.location,
                email: user.email,
                public_repos: user.public_repos,
                followers_count: user.followers,
                following_count: user.following,
                created_at: user.created_at
            };
        };

        let followers_transform = (followers_chunk) => JSON.parse(followers_chunk).map(follower => ({login: follower.login}));

        let following_transform = (following_chunk) => JSON.parse(following_chunk).map(following => ({follows: following.login}));
    }
};