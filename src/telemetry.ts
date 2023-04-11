import Analytics from 'analytics-node';
import * as hash from 'object-hash'

const { app } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {v4: uuidv4 } = require('uuid');

let userIdHashPath = path.join(os.homedir(), '.crc', "segmentIdentifyHashForExtension");
let userIdPath = path.join(os.homedir(), '.redhat', 'anonymousId');

interface Properties {
    source: string;
    tray_version: string;
    crc_version: string;
    message: string;
}

export class Telemetry {
    private traits = {
        tray_os_version: os.version(),
        tray_os_release: os.release(),
        tray_os: os.platform()
    };
    
    private context = {
        ip: "0.0.0.0"
    };

    private analytics: typeof Analytics | undefined;
    private userId: string | undefined;
    private userIdHash: string | undefined;

    constructor(private readonly telemetryEnabled: boolean, writeKey: string) {
        if (!telemetryEnabled) {
            return
        }

        this.analytics = new Analytics(writeKey, { flushAt: 1 });
        
        // get user identity UUID and cache it in userID
        this.userId = getUserId()
        
        let identity = {
            userId: this.userId, 
            traits: this.traits
        }

        // get the hash of the user identity
        this.userIdHash = getUserIdHash()
        
        const idHash = hash.sha1(identity)
        if (idHash !== this.userIdHash) {
            // update userIdHash
            this.userIdHash = idHash
            writeUserIdHash(idHash)
            
            // send identify event to segment
            this.analytics.identify({
                userId: this.userId,
                traits: this.traits,
                context: this.context
            })
        }
    }

    trackError(errorMsg: string): void {
        if (!this.telemetryEnabled) {
            return
        }

        let properties = genProperties(errorMsg)

        this.analytics?.track({
            userId: this.userId,
            event: 'tray error occured',
            context: this.context,
            properties: properties
        })
    }

    trackSuccess(successMsg: string): void {
        if (!this.telemetryEnabled) {
            return
        }

        let properties = genProperties(successMsg)

        this.analytics?.track({
            userId: this.userId,
            event: 'tray operation successful',
            context: this.context,
            properties: properties
        })
    }
}

// fetch userID from ~/.redhat/anonymousID if exists
// or else generate, write to disk and return the it
function getUserId() {
    try {
        let data = fs.readFileSync(userIdPath)
        return data.toString()
    } catch (err) {
        console.log(err)
        let uuid = writeNewUuid()
        return uuid
    }
}

function writeNewUuid() {
    let dir = path.join(app.getPath('home'), '.redhat')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    let uuid = uuidv4()
    try {
        fs.writeFileSync(userIdPath, uuid)
        return uuid
    } catch (err) {
        console.log(err)
        return
    }
}

function writeUserIdHash(userIdHash: string): void {
    try {
        fs.writeFileSync(userIdHashPath, userIdHash)
        console.log(`wrote new identity hash to: ${userIdHashPath}`)
    } catch (err) {
        console.log(err)
        return
    }
}

function getUserIdHash(): string {
    try {
        let data = fs.readFileSync(userIdHashPath)
        return data.toString()
    } catch (err) {
        console.log(err)
        return ""
    }
}

function genProperties(message: string): Properties {
    const properties = {
        source: "tray-electron",
        tray_version: app.getVersion(),
        crc_version: "",
        message: message
    }
    return properties
}