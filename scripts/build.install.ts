import fs from 'fs'
import path from 'path'

type Filter = (name: string) => boolean

function sameFile(a: string, b: string): boolean {
    if (!fs.existsSync(b))
        return false
    let ai = fs.statSync(a)
    let bi = fs.statSync(b)
    return ai.mtimeMs === bi.mtimeMs && ai.size === bi.size
}

function copyFile(src: string, dst: string) {
    let dp = path.resolve(dst, '..')
    if (!fs.existsSync(dp))
        fs.mkdirSync(dp, {recursive: true})
    if (sameFile(src, dst))
        return
    console.log('copy', src, '->', dst)
    fs.copyFileSync(src, dst)
}

function copyDir(src: string, dst: string, filter?: Filter, filterDir?: Filter) {
    fs.readdirSync(src, {withFileTypes: true}).forEach(dir => {
        let name = dir.name
        if (dir.isDirectory()) {
            if (filterDir?.(name) !== false)
                copyDir(path.resolve(src, name), path.resolve(dst, name), filter, filterDir)
        } else {
            if (filter?.(name) !== false)
                copyFile(path.resolve(src, name), path.resolve(dst, name))
        }
    })
}

function headerFilter(name: string) {
    return name.endsWith('.h')
}

function sourceDirFilter(name: string) {
    return !/test|simple|example|build|doc|third_party/.test(name)
}

function noSubDirFilter() {
    return false
}

function libFilter(name: string) {
    return /^sk.*\.lib$/.test(name)
}

function dllFilter(name: string) {
    return /^.*\.dll$/.test(name)
}

function debugFilter(name: string) {
    return /^sk.*\.exp$/.test(name)
}

let OUT: string

function copyOutDir(src: string, dst: string = src, filter?: Filter, filterDir?: Filter) {
    copyDir(src, path.resolve(OUT, dst), filter, filterDir)
}

function copyOutFile(src: string) {
    copyFile(src, path.resolve(OUT, src))
}

export function install(dir: string, out: string) {
    OUT = out
    if (!fs.existsSync(out))
        fs.mkdirSync(out, {recursive: true})
    let name = path.basename(dir)
    let nameReg = /^(\S+)-(\S+)-(\S+)-(\S+)$/
    if (!nameReg.test(name))
        throw new Error(`unsupported name: ${name}`)
    let [_, compiler, type, buildType, runtime] = nameReg.exec(name)!
    copyOutDir('include', 'include', headerFilter)
    copyOutDir('third_party/externals', 'externals', headerFilter, sourceDirFilter)
    let isStatic = type === 'static'
    let isDebug = buildType === 'debug'

    dir = path.resolve('out', dir)
    copyOutDir(dir, 'lib', libFilter, noSubDirFilter)
    if (isStatic) {
        copyOutDir('src', 'src', headerFilter, sourceDirFilter)
        copyOutDir('tools', 'tools', headerFilter, sourceDirFilter)
    } else {
        copyOutDir(dir, 'bin', dllFilter, noSubDirFilter)
    }

    if (isDebug) {
        copyOutDir(dir, 'bin', debugFilter, noSubDirFilter)
    }

    copyOutFile('LICENSE')
    copyOutFile('README')
    copyOutFile('RELEASE_NOTES.md')
}
