import {spawnSync} from 'child_process'

export function getRegs(path: string) {
    let r = spawnSync('powershell', [
        '-Command',
        `Get-ItemProperty '${path}'`
    ], {
        stdio: 'pipe',
    })
    let str = r.stdout.toString().trim()
    if (str.length < 1)
        throw new Error(`Get '${path}' failed`)
    let parts = str.split('\r\n\r\n')
    let infos: Record<string, string>[] = []
    parts.forEach(partRaw => {
        let info: Record<string, string> = {}
        let partStr = partRaw.replaceAll(/\r\n\s+/g, '')
        let lines = partStr.split('\r\n')
        lines.forEach(line => {
            let i = line.indexOf(':')
            let key = line.substring(0, i)
            let value = line.substring(i + 1)
            info[key.trim()] = value.trim()
        })
        infos.push(info)
    })
    return infos
}

export function getRegChildren(path: string): string[] {
    let r = spawnSync('powershell', [
        '-Command',
        `Get-ChildItem '${path}' -Name`
    ], {
        stdio: 'pipe',
    })
    if(r.stderr.length)
        throw new Error(r.stderr.toString())
    let str = r.stdout.toString().trim()
    return str.split('\r\n')
}
