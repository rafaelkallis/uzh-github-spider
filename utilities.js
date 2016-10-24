/**
 * Created by rafaelkallis on 13.10.16.
 */
module.exports = {
    baseURL: function (auth) {
        return 'https://' + (auth ? (auth.users + ':' + auth.key + '@') : '') + 'api.github.com/';
    },

    range: function (n) {
        let array = [];
        let i = 1;
        while (i <= n) array.push(i++);
        return array;
    },

    /**
     * Groups elements by keys
     * @param array
     * @param getKey
     * @returns {{}}
     */
    groupBy: function (array, getKey) {
        let groups = {};
        array.forEach((elem) => {
            let key = getKey(elem);
            groups[key] && (groups[key].push(elem)) || (groups[key] = [elem]);
        });
        return Object.keys(groups).map((key) => groups[key]);
    },

    /**
     * Reduces array elements
     * @param array
     * @param init
     * @param func
     * @returns {*}
     */
    reduce: function (array, init, func) {
        array.forEach((element) => init = func(init, element));
        return init;
    }
};