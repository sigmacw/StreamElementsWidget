class StreamElementsWidget {
    constructor({ name = 'goal', config = {} }) {
        this.name = name
        this.state = {
            ...this.getDefaultState(),
            ...config
        };

        this.listeners = {};
        this.eventMap = {
            "subscriber-latest": this.handleSubscriber.bind(this),
            "follower-latest": (e) => this.handleFollower.bind(this),
            "cheer-latest": (e) => this.handleCheer.bind(this),
            "tip-latest": (e) => this.handleTip.bind(this),
            "raid-latest": (e) => this.handleRaid.bind(this),
            "delete-message": (e) => this.emit("delete-message", e),
            "delete-messages": (e) => this.emit("delete-messages", e),
            "message": (e) => this.emit("message", e),
        };

        window.addEventListener("onWidgetLoad", (e) => {
            this.data = e.detail.fieldData;
            this.loadState(e);
        });

        window.addEventListener("onEventReceived", (obj) => {
            const { listener, event } = obj.detail;

            if (event.listener === "widget-button") {
                this.emit("widget-button", event.field);
                return;
            }

            const handler = this.eventMap[listener];
            if (handler) {
                handler(event);
            } else {
                throw new Error(`Unknown listener: ${listener}`);
            }
        });
    }

    on(type, callback) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(callback);
    }

    emit(type, event) {
        if (!this.listeners[type]) return;
        for (const cb of this.listeners[type]) cb(event);
    }

    /* Event handlers */

    handleFollower(event) {
        this.setLatestFollower(event.name)
        this.emit("follower", event)
    }

    handleSubscriber(event) {
        if (event.isCommunityGift) return;

        if (event.bulkGifted) {
            this.setLatestSubscriber(event.name, event.amount)
            this.emit("subscriber-bulk-gift", event);
        } else if (event.gifted) {
            this.setLatestSubscriber(event.sender, event.amount)
            this.emit("subscriber-gift", event);
        } else if (event.amount > 1) {
            this.setLatestSubscriber(event.name, event.amount)
            this.emit("subscriber-resub", event);
        } else {
            this.setLatestSubscriber(event.name, event.amount)
            this.emit("subscriber-new", event);
        }

        this.emit("subscriber", event); // catch-all
    }

    handleCheer(event) {
        this.setLatestCheer(event.name, event.amount)
        this.emit("cheer", event)
    }

    handleTip(event) {
        this.setLatestTip(event.name, event.amount)
        this.emit("tip", event)
    }

    handleRaid(event) {
        this.setLatestRaid(event.name, event.amount)
        this.emit("raid", event)
    }

    handleMessage(e) {
        const data = e.detail.event.data;
        const role = this.check_role(data);
        const tier = checkTier(data.tags.badges);
        const name = data.displayName;
        const message = this.attachEmotes(data);

        let badges = ``;
        for (let i = 0; i < data.badges.length; i++) {
            let badge = data.badges[i];
            badges += `<img alt="" src="${badge.url}" class="badge"> `;
        }

        const emoteOnly = this.isEmote(data);

        this.emit("message", {
            name: name,
            message: message,
            emoteOnly: emoteOnly,
            role: role.role,
            subscriber: role.subscribed,
            ...(role.subscribed && { tier: tier })
        })
    }

    /* Widget load */

    loadState(e) {
        SE_API.store.get(this.name).then((obj) => {
            if (obj && !this.isEmpty(obj)) {
                this.state = obj;
            } else {
                SE_API.store.set(this.name, this.state);
            }

            this.emit("load", e.detail);
        })
    }

    getDefaultState() {
        return {
            total: {
                followers: 0,
                subscribers: 0,
                bits: 0,
                tips: 0
            },
            latest: {
                follower: { name: '' },
                subscriber: { name: '', amount: 0 },
                cheer: { name: '', amount: 0 },
                tip: { name: '', amount: 0 },
                raid: { name: '', amount: 0 }
            },
            refreshFrequency: "day",
            currency: '$'
        };
    }

    isEmpty(obj) {
        for (const prop in obj) {
            if (Object.hasOwn(obj, prop)) {
                return false;
            }
        }

        return true;
    }

    /* Get data */

    getFollows() {
        return this.state.total.followers;
    }

    getSubs() {
        return this.state.total.subscribers;
    }

    getBits() {
        return this.state.total.bits;
    }

    getTips() {
        return this.state.total.tips;
    }

    getLatestFollower() {
        return this.state.latest.follower
    }

    getLatestSubscriber() {
        return this.state.latest.subscriber
    }

    getLatestCheer() {
        return this.state.latest.cheer
    }

    getLatestTip() {
        return this.state.latest.tip
    }

    getLatestRaid() {
        return this.state.latest.raid
    }

    /* Set data */

    setFollows(n) {
        this.state.total.followers = n;
        SE_API.store.set(this.name, this.state);
    }

    setSubs(n) {
        this.state.total.subscribers = n;
        SE_API.store.set(this.name, this.state);
    }

    setBits(n) {
        this.state.total.bits = n;
        SE_API.store.set(this.name, this.state);
    }

    setTips(n) {
        this.state.total.tips = n;
        SE_API.store.set(this.name, this.state);
    }

    setLatestFollower(name) {
        this.state.latest.follower = { name: name }
    }

    setLatestSubscriber(name, amount) {
        this.state.latest.subscriber = { name: name, amount: amount }
    }

    setLatestCheer(name, amount) {
        this.state.latest.cheer = { name: name, amount: amount }
    }

    setLatestTip(name, amount) {
        this.state.latest.tip = { name: name, amount: amount }
    }

    setLatestRaid(name, amount) {
        this.state.latest.raid = { name: name, amount: amount }
    }

    /* Modify data */

    addFollows(n) {
        this.state.total.followers += n;
        SE_API.store.set(this.name, this.state);
    }

    addSubs(n) {
        this.state.total.subscribers += n;
        SE_API.store.set(this.name, this.state);
    }

    addBits(n) {
        this.state.total.bits += n;
        SE_API.store.set(this.name, this.state);
    }

    addTips(n) {
        this.state.total.tips += n;
        SE_API.store.set(this.name, this.state);
    }

    /* Helpers */

    attachEmotes(message) {
        let text = html_encode(message.text);
        let data = message.emotes;
        if (data[0]) {
            hasEmotes = "has-emotes"
        } else {
            hasEmotes = ""
        }
        let isEmoteOnly = isEmote(message)
        if (typeof message.attachment !== "undefined") {
            if (typeof message.attachment.media !== "undefined") {
                if (typeof message.attachment.media.image !== "undefined") {
                    text = `${message.text}<img src="${message.attachment.media.image.src}">`;
                }
            }
        }
        return text
            .replace(
                /([^\s]*)/gi,
                function (m, key) {
                    let result = data.filter(emote => {
                        return this.html_encode(emote.name) === key
                    });
                    if (typeof result[0] !== "undefined") {
                        let url;
                        if (isEmoteOnly) {
                            url = result[0]['urls'][4];
                        } else {
                            url = result[0]['urls'][1];
                        }
                        if (provider === "twitch") {
                            return `<img class="emote" src="${url}"/>`;
                        } else {
                            if (typeof result[0].coords === "undefined") {
                                result[0].coords = {
                                    x: 0,
                                    y: 0
                                };
                            }
                            let x = parseInt(result[0].coords.x);
                            let y = parseInt(result[0].coords.y);

                            let width = "28px";
                            let height = "auto";
                            return `<div class="emote" style="width: ${width}; height:${height}; display: inline-block; background-image: url(${url}); background-position: -${x}px -${y}px;"></div>`;
                        }
                    } else return key;
                }
            );
    }

    html_encode(e) {
        return e.replace(/[<>"^]/g, function (e) {
            return "&#" + e.charCodeAt(0) + ";";
        });
    }

    check_role(data) {
        let role;
        let badges = data.tags.badges;
        if (badges.includes('broadcaster')) {
            role = 'broadcaster'
        } else if (badges.includes('moderator')) {
            role = 'moderator'
        } else if (badges.includes('vip')) {
            role = 'vip'
        } else if (badges.includes('artist-badge')) {
            role = 'artist'
        } else if (badges.includes('subscriber')) {
            role = 'subscriber'
        }

        let isSub = false
        if (badges.includes('subscriber')) {
            isSub = true
        }

        return { role: role, subscribed: isSub }
    }

    checkTier(badge) {
        let tier;
        if (/subscriber\/30\d\d/i.test(badge)) {
            tier = 'tier-3';
        } else if (/subscriber\/20\d\d/i.test(badge)) {
            tier = 'tier-2';
        } else if (/subscriber\/\d/i.test(badge) || /subscriber\/\d\d/i.test(badge)) {
            tier = 'tier-1';
        } else {
            tier = '';
        }
        return tier;
    }

    isEmote(data) {
        let msg = data.text;
        msg = msg.replace(/\s\s+/g, ' ');
        let msg_split = msg.split(" ");

        let emotes = data.emotes;

        let emoteOnly = true;
        const emote_names = emotes.map((e) => e.name);

        for (let i = 0; i < msg_split.length; i++) {
            if (!emote_names.includes(msg_split[i])) {
                emoteOnly = false
            }
        }
        return emoteOnly;
    }

}

class WidgetTester {
    constructor() {

    }

    sendTestMessage(name, role, subscribed, tier, message) {
        const d = this.getMessageSchema(name, role, subscribed, tier, message)
        const e = new CustomEvent('onEventReceived', d)
        window.dispatchEvent(e)
    }

    sentTestAlert() {
        const d = {
            detail: {
                "listener": "subscriber-latest",
                "event": {
                    "amount": 1,
                    "avatar": "https://cdn.streamelements.com/assets/dashboard/my-overlays/overlay-default-preview-2.jpg",
                    "providerId": "66557371",
                    "name": "traveler",
                    "_id": "651868c5a96001c592035214",
                    "sessionTop": false,
                    "type": "subscriber",
                    "originalEventName": "subscriber-latest"
                }
            }
        }

        const e = new CustomEvent('onEventReceived', d)
        window.dispatchEvent(e)
    }

    getMessageSchema(name, role, subscribed, tier, message) {
        const msgID = (Math.random() + 1).toString(36).substring(7) +
            (Math.random() + 1).toString(36).substring(7);

        let badges = '';
        const badgeArray = [];
        switch (role) {
            case "subscriber":
                badges = 'subscriber/' + (tier === 1 ? 1 : tier * 1000);
                badgeArray.push(this.getBadge('subscriber'));
                break;
            case "":
                break;
            default:
                badges = role + '/1';
                badgeArray.push(this.getBadge(role))

                if (subscribed) {
                    badges += 'subscriber/' + (tier === 1 ? 1 : tier * 1000);
                    badgeArray.push(this.getBadge('subscriber'));
                }
                break;
        }

        return {
            detail: {
                listener: "message",
                event: {
                    service: "twitch",
                    data: {
                        time: Date.now(),
                        tags: {
                            badges: badges,
                        },
                        nick: name,
                        userId: "100135110",
                        displayName: name,
                        displayColor: "#5B99FF",
                        badges: badgeArray,
                        channel: name,
                        text: message,
                        isAction: !1,
                        emotes: [],
                        msgId: msgID
                    },
                    renderedText: message
                }
            }
        }
    }

    getBadge(type) {
        switch (type) {
            case "subscriber":
                return {
                    type: "subscriber",
                    version: "1",
                    url: "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3",
                    description: "Subscriber"
                }
            case "moderator":
                return {
                    type: "moderator",
                    version: "1",
                    url: "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3",
                    description: "Moderator"
                }
            case "broadcaster":
                return {
                    type: "broadcaster",
                    version: "1",
                    url: "https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3",
                    description: "Broadcaster"
                }
            case "artist":
                return {
                    type: "artist",
                    version: "1",
                    url: "https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3",
                    description: "Artist"
                }
            case "vip":
                return {
                    type: "vip",
                    version: "1",
                    url: "https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3",
                    description: "VIP"
                }
            case "partner":
                return {
                    type: "partner",
                    version: "1",
                    url: "https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3",
                    description: "Verified"
                }
        }
    }
}
