// ===== StreamElementsWidget Class =====

class StreamElementsWidget {
    /**
     * @param {Object} options - Configuration options.
     * @param {string} [options.name='goal'] - Storage key name for SE_API store.
     * @param {Object} [options.config={}] - Initial state override.
     */
    constructor({ name = 'goal', config = {} }) {
        this.name = name;

        // ===== Initial State Setup =====
        this.state = {
            ...this.#getDefaultState(),
            ...config
        };

        // ===== Internal Event Listener Registry =====
        this.listeners = {};

        // ===== Event Routing Map =====
        this.eventMap = {
            "subscriber-latest": this.#handleSubscriber.bind(this),
            "follower-latest": (e) => this.#handleFollower.bind(this),
            "cheer-latest": (e) => this.#handleCheer.bind(this),
            "tip-latest": (e) => this.#handleTip.bind(this),
            "raid-latest": (e) => this.#handleRaid.bind(this),
            "delete-message": (e) => this.#emit("delete-message", e),
            "delete-messages": (e) => this.#emit("delete-messages", e),
            "message": (e) => this.#handleMessage.bind(this),
        };

        // ===== Widget Load Hook =====
        window.addEventListener("onWidgetLoad", (e) => {
            this.data = e.detail.fieldData;
            this.#loadState(e);
        });

        // ===== Event Dispatch Hook =====
        window.addEventListener("onEventReceived", (obj) => {
            const { listener, event } = obj.detail;

            // Handle internal widget button events separately
            if (event.listener === "widget-button") {
                this.#emit("widget-button", event.field);
                return;
            }

            // Call matching event handler
            const handler = this.eventMap[listener];
            if (handler) {
                handler(event);
            } else {
                throw new Error(`Unknown listener: ${listener}`);
            }
        });
    }

    // ===== Pub/Sub Utilities =====

    /**
     * Registers a callback for a given event type.
     * @param {string} type - Event type.
     * @param {Function} callback - Callback to call on event.
     * Allowed event types:
     * - `follower` : triggers when a viewer follows the channel
     * - `subscriber-new` : triggers on a new subscriber
     * - `subscriber-resub` : triggers on a returning subscriber
     * - `subscriber-gift` : triggers when a viewer gifts a subscription to another viewer
     * - `subscriber-bulk` : triggers when a viewer gifts multiple subs
     * - `cheer` : triggers when a viewer sends bits
     * - `tip` : triggers when a viewer sends a donation through StreamElements
     * - `raid` : triggers when the channel is raided by another streamer
     * - `message` : triggers whenever a chat message is sent
     * - `delete-message` : triggers when a channel moderator deletes a single message
     * - `delete-messages` : triggers when a channel moderator deletes multiple messages (e.g. user timeout)
     */
    on(type, callback) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(callback);
    }

    /**
     * Emits an event to all registered listeners.
     * @param {string} type - Event type.
     * @param {Object} event - Event payload.
     */
    #emit(type, event) {
        if (!this.listeners[type]) return;
        for (const cb of this.listeners[type]) cb(event);
    }

    // ===== Event Handlers =====

    #handleFollower(event) {
        this.setLatestFollower(event.name);
        this.#emit("follower", event);
    }

    #handleSubscriber(event) {
        if (event.isCommunityGift) return;

        if (event.bulkGifted) {
            this.setLatestSubscriber(event.name, event.amount);
            this.#emit("subscriber-bulk-gift", event);
        } else if (event.gifted) {
            this.setLatestSubscriber(event.sender, event.amount);
            this.#emit("subscriber-gift", event);
        } else if (event.amount > 1) {
            this.setLatestSubscriber(event.name, event.amount);
            this.#emit("subscriber-resub", event);
        } else {
            this.setLatestSubscriber(event.name, event.amount);
            this.#emit("subscriber-new", event);
        }

        this.#emit("subscriber", event); // General subscriber event
    }

    #handleCheer(event) {
        this.setLatestCheer(event.name, event.amount);
        this.#emit("cheer", event);
    }

    #handleTip(event) {
        this.setLatestTip(event.name, event.amount);
        this.#emit("tip", event);
    }

    #handleRaid(event) {
        this.setLatestRaid(event.name, event.amount);
        this.#emit("raid", event);
    }

    // ===== Message Parsing =====

    #handleMessage(e) {
        const data = e.detail.event.data;
        const role = this.#check_role(data);
        const tier = this.#checkTier(data.tags.badges);
        const name = data.displayName;
        const message = this.#attachEmotes(data);

        let badges = ``;
        for (let badge of data.badges) {
            badges += `<img alt="" src="${badge.url}" class="badge"> `;
        }

        const emoteOnly = this.#isEmote(data);

        this.#emit("message", {
            name: name,
            message: message,
            emoteOnly: emoteOnly,
            role: role.role,
            subscriber: role.subscribed,
            ...(role.subscribed && { tier: tier })
        });
    }

    // ===== Load / Save State =====

    #loadState(e) {
        SE_API.store.get(this.name).then((obj) => {
            if (obj && !this.#isEmpty(obj)) {
                this.state = obj;
            } else {
                SE_API.store.set(this.name, this.state);
            }

            this.#emit("load", e.detail);
        });
    }

    #getDefaultState() {
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

    #isEmpty(obj) {
        for (const prop in obj) {
            if (Object.hasOwn(obj, prop)) return false;
        }
        return true;
    }

    // ===== Getters =====

    /**
     * Get total follower count 
     * @returns {number} 
     */
    getFollows() { return this.state.total.followers; }

    /**
     * Get total subscriber count 
     * @returns {number} 
     */
    getSubs() { return this.state.total.subscribers; }

    /**
     * Get total bits count 
     * @returns {number} 
     */
    getBits() { return this.state.total.bits; }

    /**
     * Get total tips count (doesn't track currency)
     * @returns {number} 
     */
    getTips() { return this.state.total.tips; }

    /** 
     * Get latest follower's `name`
     * @returns { { name: string } } 
     */
    getLatestFollower() { return this.state.latest.follower; }

    /** 
     * Get latest subscriber's `name` and `amount`.
     * `amount` means different things for different subscribers:
     * - New subscriber (`subcriber-new`)          : always `1`
     * - Returning subscriber (`subscriber-resub`) : number of `months`
     * - Individual gift (`subscriber-gift`)       : always `1`
     * - Bulk gift (`subscriber-bulk`)             : number of `subs gifted`
     * 
     * @returns { { name: string, amount: number } } 
     */
    getLatestSubscriber() { return this.state.latest.subscriber; }

    /** 
     * Get latest cheerer's `name` and bits `amount`
     * @returns { { name: string, amount: number } } 
     */
    getLatestCheer() { return this.state.latest.cheer; }

    /** 
     * Get latest donator's `name` and tip `amount`
     * @returns { { name: string, amount: number } } 
     */
    getLatestTip() { return this.state.latest.tip; }

    /** 
     * Get latest raider's `name` and viewer `amount`
     * @returns { { name: string, amount: number } } 
     */
    getLatestRaid() { return this.state.latest.raid; }

    // ===== Setters =====

    /**
     * Sets the total follower count.
     * @param {number} n
     */
    setFollows(n) {
        this.state.total.followers = n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Sets the total subscriber count.
     * @param {number} n
     */
    setSubs(n) {
        this.state.total.subscribers = n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Sets the total bit count.
     * @param {number} n
     */
    setBits(n) {
        this.state.total.bits = n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Sets the total tip amount.
     * @param {number} n
     */
    setTips(n) {
        this.state.total.tips = n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Sets the most recent follower.
     * @param {string} name
     */
    setLatestFollower(name) {
        this.state.latest.follower = { name };
    }

    /**
     * Sets the most recent subscriber and their sub count.
     * @param {string} name
     * @param {number} amount
     */
    setLatestSubscriber(name, amount) {
        this.state.latest.subscriber = { name, amount };
    }

    /**
     * Sets the most recent cheer and amount.
     * @param {string} name
     * @param {number} amount
     */
    setLatestCheer(name, amount) {
        this.state.latest.cheer = { name, amount };
    }

    /**
     * Sets the most recent tip and amount.
     * @param {string} name
     * @param {number} amount
     */
    setLatestTip(name, amount) {
        this.state.latest.tip = { name, amount };
    }

    /**
     * Sets the most recent raid and viewer count.
     * @param {string} name
     * @param {number} amount
     */
    setLatestRaid(name, amount) {
        this.state.latest.raid = { name, amount };
    }

    // ===== Modifiers =====

    /**
     * Increments follower count.
     * @param {number} n
     */
    addFollows(n) {
        this.state.total.followers += n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Increments subscriber count.
     * @param {number} n
     */
    addSubs(n) {
        this.state.total.subscribers += n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Increments bit total.
     * @param {number} n
     */
    addBits(n) {
        this.state.total.bits += n;
        SE_API.store.set(this.name, this.state);
    }

    /**
     * Increments tip total.
     * @param {number} n
     */
    addTips(n) {
        this.state.total.tips += n;
        SE_API.store.set(this.name, this.state);
    }

    // ===== Helpers =====

    #attachEmotes(message) {
        let text = this.#html_encode(message.text);
        let data = message.emotes;
        let isEmoteOnly = this.#isEmote(message);

        if (message?.attachment?.media?.image) {
            text = `${message.text}<img src="${message.attachment.media.image.src}">`;
        }

        return text.replace(/([^\s]*)/gi, function (m, key) {
            let result = data.filter(emote => this.#html_encode(emote.name) === key);
            if (result[0]) {
                let url = isEmoteOnly ? result[0]['urls'][4] : result[0]['urls'][1];
                if (provider === "twitch") {
                    return `<img class="emote" src="${url}"/>`;
                } else {
                    let { x = 0, y = 0 } = result[0].coords || {};
                    return `<div class="emote" style="width: 28px; display: inline-block; background-image: url(${url}); background-position: -${x}px -${y}px;"></div>`;
                }
            } else return key;
        });
    }

    #html_encode(e) {
        return e.replace(/[<>"^]/g, c => "&#" + c.charCodeAt(0) + ";");
    }

    #check_role(data) {
        let badges = data.tags.badges;
        let role = badges.includes('broadcaster') ? 'broadcaster' :
                   badges.includes('moderator') ? 'moderator' :
                   badges.includes('vip') ? 'vip' :
                   badges.includes('artist-badge') ? 'artist' :
                   badges.includes('subscriber') ? 'subscriber' : '';

        return { role, subscribed: badges.includes('subscriber') };
    }

    #checkTier(badge) {
        if (/subscriber\/30\d\d/i.test(badge)) return 'tier-3';
        if (/subscriber\/20\d\d/i.test(badge)) return 'tier-2';
        if (/subscriber\/\d\d?/i.test(badge)) return 'tier-1';
        return '';
    }

    #isEmote(data) {
        const msgWords = data.text.replace(/\s+/g, ' ').split(" ");
        const emoteNames = data.emotes.map(e => e.name);
        return msgWords.every(word => emoteNames.includes(word));
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
