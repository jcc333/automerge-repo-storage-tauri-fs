import { StorageAdapter, StorageKey, Chunk } from "@automerge/automerge-repo"
import * as path from "@tauri-apps/api/path"
import * as fs from "@tauri-apps/api/fs"
import { platform } from "@tauri-apps/api/os"

export class TauriFileSystemStorageAdapter extends StorageAdapter {
    private baseDirectory: string
    private cache: { [key: string]: Uint8Array } = {}

    constructor(baseDirectory: string = "automerge-repo-data") {
        super()
        this.baseDirectory = baseDirectory
    }

    async load(storageKey: StorageKey): Promise<undefined | Uint8Array> {
        let result = await this.loadCache(storageKey)
        if (!result) {
            result = this.loadFile(storageKey)
            if (result) {
                await this.saveCache(storageKey, result)
            }
        }
        return result
    }

    async save(storageKey: StorageKey, binary: Uint8Array): Promise<void> {
        return Promise.all([
            this.saveCache(storageKey, binary),
            this.saveFile(storageKey, binary),
        ]).then((_) => {})
    }

    async remove(storageKey: StorageKey): Promise<void> {
        return Promise.all([
            this.removeCache(storageKey),
            this.removeFile(storageKey),
        ]).then((_) => {})
    }

    async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
        /* This whole function does a bunch of gratuitious string manipulation
           and could probably be simplified. */
        const dirPath = await this.getFilePath(keyPrefix)

        // Get the list of all cached keys that match the prefix
        const cachedKeys = await this.cachedKeys(keyPrefix)

        // Read filenames from disk
        const diskFiles = await walkdir(dirPath)

        // The "keys" in the cache don't include the baseDirectory.
        // We want to de-dupe with the cached keys so we'll use getKey to normalize them.
        const diskKeys: string[] = await Promise.all(
            diskFiles.map(async (fileName: string) => {
                const relativePath = await relative(this.baseDirectory, fileName)
                return getKey([relativePath])
            })
        )

        // Combine and deduplicate the lists of keys
        const allKeys = [...new Set([...cachedKeys, ...diskKeys])]

        // Load all files
        const chunks = await Promise.all(
            allKeys.map(async keyString => {
                const key: StorageKey = keyString.split(path.sep)
                const data = await this.load(key)
                return { data, key }
            })
        )
        return chunks
    }

    async removeRange(keyPrefix: StorageKey): Promise<void> {
        // remove from cache
        return Promise.all([
            this.removeRangeCache(keyPrefix),
            this.removeRangeFile(keyPrefix),
        ]).then(() => {})
    }

    private async cachedKeys(keyPrefix: string[]): Promise<string[]> {
        const cacheKeyPrefixString = await getKey(keyPrefix)
        return Object.keys(this.cache).filter(key => key.startsWith(cacheKeyPrefixString))
    }

    private async getFilePath(storageKey: StorageKey): Promise<string> {
        const [firstKey, ...remainingKeys] = storageKey
        const firstKeyPrefix = firstKey.slice(0, 2)
        const firstKeySuffix = firstKey.slice(2)
        const firstKeyDir = await path.join(
            this.baseDirectory,
            firstKeyPrefix,
            firstKeySuffix
        )
        return path.join(firstKeyDir, ...remainingKeys)
    }

    private async loadCache(storageKey: StorageKey): Promise<undefined | Uint8Array> {
        const cacheKey = await getKey(storageKey)
        const cacheHit = this.cache[cacheKey]
        return cacheHit ? cacheHit : undefined
    }

    private async loadFile(storageKey: StorageKey): Promise<undefined | Uint8Array> {
        const filePath = await this.getFilePath(storageKey)
        const isExistingFile = await fs.exists(filePath)
        if (isExistingFile) {
            const contents = await fs.readBinaryFile(filePath)
            return contents
        }
    }

    private async saveCache(storageKey: StorageKey, binary: Uint8Array): Promise<void> {
        const key = await getKey(storageKey)
        this.cache[key] = binary
    }

    private async saveFile(storageKey: StorageKey, binary: Uint8Array): Promise<void> {
        const filePath = await this.getFilePath(storageKey)
        const filePathDir = await path.dirname(filePath)
        await fs.createDir(filePathDir, { recursive: true })
        await fs.writeBinaryFile(filePath, binary)
    }

    private async removeCache(storageKey: StorageKey): Promise<void> {
        const cacheKey = await getKey(storageKey)
        delete this.cache[cacheKey]
    }

    private async removeFile(storageKey: StorageKey): Promise<void> {
        // remove from disk
        const filePath = await this.getFilePath(storageKey)
        if (await fs.exists(filePath)) {
            await fs.removeFile(filePath)
        }
    }

    private async removeRangeCache(keyPrefix: StorageKey): Promise<void> {
        return this.cachedKeys(keyPrefix).then(keys => keys.forEach(key => delete this.cache[key]))
    }

    private async removeRangeFile(keyPrefix: StorageKey): Promise<void> {
        const dirPath = await this.getFilePath(keyPrefix)
        await fs.removeDir(dirPath, { recursive: true })
    }
}

// HELPERS

const relative = async (from: string, to: string): Promise<string> => {
    if (await platform() === 'win32') {
        return await relativeWin32(from, to)
    } else {
        return await relativePosix(from, to)
    }
}

const relativeWin32 = async (rawFrom: string, rawTo: string): Promise<string> => {
    const CHAR_BACKWARD_SLASH = 92 /* \ */
    if (rawFrom === rawTo) {
        return Promise.resolve('')
    }

    const fromOrig = await path.resolve(rawFrom)
    const toOrig = await path.resolve(rawTo)

    const from = fromOrig.toLowerCase()
    const to = toOrig.toLowerCase()

    if (from === to) {
        return Promise.resolve('')
    }
    // Trim any leading backslashes
    let fromStart = 0;
    while (fromStart < from.length &&
        from.charCodeAt(fromStart) === CHAR_BACKWARD_SLASH) {
        fromStart++;
    }
    // Trim trailing backslashes (applicable to UNC paths only)
    let fromEnd = from.length;
    while (
        fromEnd - 1 > fromStart &&
            from.charCodeAt(fromEnd - 1) === CHAR_BACKWARD_SLASH
    ) {
        fromEnd--;
    }
    const fromLen = fromEnd - fromStart;

    // Trim any leading backslashes
    let toStart = 0;
    while (toStart < to.length &&
        to.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) {
        toStart++;
    }
    // Trim trailing backslashes (applicable to UNC paths only)
    let toEnd = to.length;
    while (toEnd - 1 > toStart &&
        to.charCodeAt(toEnd - 1) === CHAR_BACKWARD_SLASH) {
        toEnd--;
    }
    const toLen = toEnd - toStart;

    // Compare paths to find the longest common path from root
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i < length; i++) {
        const fromCode = from.charCodeAt(fromStart + i);
        if (fromCode !== to.charCodeAt(toStart + i))
            break;
        else if (fromCode === CHAR_BACKWARD_SLASH)
            lastCommonSep = i;
    }

    // We found a mismatch before the first common path separator was seen, so
    // return the original `to`.
    if (i !== length) {
        if (lastCommonSep === -1)
            return toOrig;
    } else {
        if (toLen > length) {
            if (to.charCodeAt(toStart + i) ===
                CHAR_BACKWARD_SLASH) {
                // We get here if `from` is the exact base path for `to`.
                // For example: from='C:\\foo\\bar'; to='C:\\foo\\bar\\baz'
                return toOrig.slice(toStart + i + 1);
            }
            if (i === 2) {
                // We get here if `from` is the device root.
                // For example: from='C:\\'; to='C:\\foo'
                return toOrig.slice(toStart + i);
            }
        }
        if (fromLen > length) {
            if (from.charCodeAt(fromStart + i) ===
                CHAR_BACKWARD_SLASH) {
                // We get here if `to` is the exact base path for `from`.
                // For example: from='C:\\foo\\bar'; to='C:\\foo'
                lastCommonSep = i;
            } else if (i === 2) {
                // We get here if `to` is the device root.
                // For example: from='C:\\foo\\bar'; to='C:\\'
                lastCommonSep = 3;
            }
        }
        if (lastCommonSep === -1)
            lastCommonSep = 0;
    }

    let out = '';
    // Generate the relative path based on the path difference between `to` and
    // `from`
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
        if (i === fromEnd ||
            from.charCodeAt(i) === CHAR_BACKWARD_SLASH) {
            out += out.length === 0 ? '..' : '\\..';
        }
    }

    toStart += lastCommonSep;

    // Lastly, append the rest of the destination (`to`) path that comes after
    // the common path parts
    if (out.length > 0)
        return `${out}${toOrig.slice(toStart, toEnd)}`;

    if (toOrig.charCodeAt(toStart) === CHAR_BACKWARD_SLASH)
        ++toStart;
    return toOrig.slice(toStart, toEnd);
}

const relativePosix = async (rawFrom: string, rawTo: string): Promise<string> => {
    const CHAR_FORWARD_SLASH = 47  /* / */


    if (rawFrom === rawTo) {
        return Promise.resolve('')
    }

    // Trim leading forward slashes.
    const from = await path.resolve(rawFrom);
    const to = await path.resolve(rawTo);

    if (from === to) {
        return Promise.resolve('')
    }

    const fromStart = 1;
    const fromEnd = from.length;
    const fromLen = fromEnd - fromStart;
    const toStart = 1;
    const toLen = to.length - toStart;

    // Compare paths to find the longest common path from root
    const length = (fromLen < toLen ? fromLen : toLen);
    let lastCommonSep = -1;
    let i = 0;
    for (; i < length; i++) {
        const fromCode = from.charCodeAt(fromStart + i);
        if (fromCode !== to.charCodeAt(toStart + i))
            break;
        else if (fromCode === CHAR_FORWARD_SLASH)
            lastCommonSep = i;
    }
    if (i === length) {
        if (toLen > length) {
            if (to.charCodeAt(toStart + i) === CHAR_FORWARD_SLASH) {
                // We get here if `from` is the exact base path for `to`.
                // For example: from='/foo/bar'; to='/foo/bar/baz'
                return to.slice(toStart + i + 1);
            }
            if (i === 0) {
                // We get here if `from` is the root
                // For example: from='/'; to='/foo'
                return to.slice(toStart + i);
            }
        } else if (fromLen > length) {
            if (from.charCodeAt(fromStart + i) ===
                CHAR_FORWARD_SLASH) {
                // We get here if `to` is the exact base path for `from`.
                // For example: from='/foo/bar/baz'; to='/foo/bar'
                lastCommonSep = i;
            } else if (i === 0) {
                // We get here if `to` is the root.
                // For example: from='/foo/bar'; to='/'
                lastCommonSep = 0;
            }
        }
    }

    let out = '';
    // Generate the relative path based on the path difference between `to`
    // and `from`.
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
        if (i === fromEnd ||
            from.charCodeAt(i) === CHAR_FORWARD_SLASH) {
            out += out.length === 0 ? '..' : '/..';
        }
    }

    // Lastly, append the rest of the destination (`to`) path that comes after
    // the common path parts.
    return `${out}${to.slice(toStart + lastCommonSep)}`;
}

const getKey = async (key: StorageKey): Promise<string> => await path.join(...key)

/** returns all files in a directory, recursively  */
const walkdir = async (dirPath: string): Promise<string[]> => {
    if (await fs.exists(dirPath)) {
        const entries = await fs.readDir(dirPath, { recursive: true })
        const files = await Promise.all(
            entries.map(async entry => {
                const subpath = await path.resolve(dirPath, entry.name)
                if (entry.children != null) {
                    return walkdir(subpath)
                } else {
                    return subpath
                }
            })
        )
        const flatFiles = files.flat()
        return flatFiles
    } else {
        return []
    }
}
