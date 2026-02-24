import crypto from "crypto"

/**
 * MASTER KEY CONFIG
 * DOC_MASTER_KEYS = JSON array:
 * [
 *   { "id": "v1", "key_b64": "...", "active": true },
 *   { "id": "v2", "key_b64": "...", "active": false }
 * ]
 */

type MasterKey = {
    id: string
    key_b64: string
    active?: boolean
}

function getMasterKeys(): MasterKey[] {
    const raw = process.env.DOC_MASTER_KEYS
    if (!raw) {
        throw new Error("DOC_MASTER_KEYS not configured")
    }
    return JSON.parse(raw)
}

function getActiveMasterKey(): MasterKey {
    const keys = getMasterKeys()
    const active = keys.find(k => k.active)
    if (!active) {
        throw new Error("No active master key configured")
    }
    return active
}

function getMasterKeyById(id: string): MasterKey {
    const keys = getMasterKeys()
    const key = keys.find(k => k.id === id)
    if (!key) {
        throw new Error(`Master key ${id} not found`)
    }
    return key
}

/**
 * Generates a random 32-byte data key (per document)
 */
function generateDataKey(): Buffer {
    return crypto.randomBytes(32)
}

/**
 * Wrap (encrypt) data key with master key
 */
function wrapDataKey(dataKey: Buffer, masterKey: Buffer): string {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv)
    const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()])
    const tag = cipher.getAuthTag()

    return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

/**
 * Unwrap (decrypt) data key using master key
 */
function unwrapDataKey(wrapped: string, masterKey: Buffer): Buffer {
    const buf = Buffer.from(wrapped, "base64")
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const encrypted = buf.subarray(28)

    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/**
 * Initialize per-document encryption
 * Returns wrapped key + key version
 */
export function initializeDocumentEncryption() {
    const master = getActiveMasterKey()
    const masterKey = Buffer.from(master.key_b64, "base64")

    const dataKey = generateDataKey()
    const wrapped = wrapDataKey(dataKey, masterKey)

    return {
        wrappedKey: wrapped,
        keyVersion: master.id,
    }
}

/**
 * Decrypt document buffer
 */
export function decryptDocumentBuffer(
    encryptedBuffer: Buffer,
    wrappedKey: string,
    keyVersion: string
): Buffer {
    const master = getMasterKeyById(keyVersion)
    const masterKey = Buffer.from(master.key_b64, "base64")

    const dataKey = unwrapDataKey(wrappedKey, masterKey)

    const iv = encryptedBuffer.subarray(0, 12)
    const tag = encryptedBuffer.subarray(12, 28)
    const encrypted = encryptedBuffer.subarray(28)

    const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/**
 * Encrypt buffer using data key (server-side encryption if needed)
 */
export function encryptBufferWithDataKey(
    buffer: Buffer,
    dataKey: Buffer
): Buffer {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, iv)

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
    const tag = cipher.getAuthTag()

    return Buffer.concat([iv, tag, encrypted])
}