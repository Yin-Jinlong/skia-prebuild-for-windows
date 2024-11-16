import path from 'path'
import {getRegChildren, getRegs} from './reg'

const WIN_SKD_REG = 'HKLM:\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots'

export function getWinKits(): WinKitInfo[] {
    let ir = getRegs(WIN_SKD_REG)
    if (!ir)
        throw new Error('No WinKits found')
    let root = ir[0]['KitsRoot10'].replace(/[/\\]$/, '')
    let vs = getRegChildren(WIN_SKD_REG)
    return vs.map(v => {
        return {
            root: root,
            path: path.resolve(root, v),
            version: v
        }
    })
}
