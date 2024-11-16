declare global {
    declare interface AppInfo {
        name: string
        version: string
        root: string
        id: string
    }

    declare interface WinKitInfo {
        root: string
        path: string
        version: string
    }
}

export {}