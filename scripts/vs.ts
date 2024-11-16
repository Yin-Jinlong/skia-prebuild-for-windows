import path from 'path'
import fs from 'fs'
import {getRegs} from './reg'

function getMSVCVersion(root: string, v?: string): string {
    let msvc = path.resolve(root, 'VC\\Tools\\MSVC')
    let versions: string[] = []
    fs.readdirSync(msvc, {withFileTypes: true}).forEach(dir => {
        if (dir.isDirectory()) {
            versions.push(dir.name)
        }
    })
    versions.sort().reverse()
    if (!versions.length)
        throw new Error(`No MSVC found at ${msvc}`)
    let r = v ? versions.find(i => i === v) : versions[0]
    if (!r)
        throw new Error(`MSVC not found: ${v}`)
    return r
}

export function getVSInfo(version?: string): AppInfo | undefined {
    let r = getRegs('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\devenv.exe')
    if (!r.length)
        return
    let def = r[0]['(default)']
    if (def[0] == '"') {
        def = def.slice(1, def.length - 1)
    }
    let root = path.resolve(def, '../../..')
    let type = path.basename(root)
    let v = path.basename(path.resolve(root, '..'))
    return {
        name: `Visual Studio ${type} ${v}`,
        version: getMSVCVersion(root, version),
        root: root,
        id: 'msvc'
    }
}
