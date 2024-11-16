import {getRegs} from './reg'

export function getLLVMInfo(): AppInfo | undefined {
    let r = getRegs('HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LLVM')
    if (!r.length)
        return
    let v = r[0]
    return {
        name: v['DisplayName'],
        version: v['DisplayVersion'],
        root: v['DisplayIcon'],
        id: 'llvm'
    }
}
