var https = require('https');


var envyCrm = function(domain, apiKey, settings) {
    this.domain = domain;
    this.apiKey = apiKey;
    this.settings = settings;

    this.setDomain = function (domain) {
        this.domain = domain;
    };
    this.setApiKey = function (apiKey) {
        this.apiKey = apiKey;
    };
    this.setSettings = function (settings) {
        this.settings = settings;
    };

    /**
     * метод отправки в crm
     */
    this.send = function (callback) {
        this.checkParams();

        var options = {
            host: this.domain,
            path: '/crm/api/v1/lead/set/?api_key=' + this.apiKey,
            method: 'POST'
        };
        var params = {request : this.settings};
        var req = https.request(options, function(res) {
            res.on('data', function (body) {
                var body = JSON.parse(body);
                var result = "Ошибка отправки";
                if (body.hasOwnProperty('status_code')) {
                    if (body.status_code == 200) {
                        result = "Лид создан";
                    } else {
                        result = body.message;
                    }
                }
                if (typeof callback == "function") {
                    callback(result);
                }
            });
        });

        req.write(JSON.stringify(params));
        req.end();
    };

    /**
     * проверка параметров перед отправкой
     */
    this.checkParams = function () {
        if (!this.domain) {
            throw new Error("Не установлен domain");
        }
        if (!this.apiKey) {
            throw new Error("Не установлен apiKey");
        }
        if (!this.settings) {
            throw new Error("Не установлены настройки");
        }
    };
};

module.exports = envyCrm;