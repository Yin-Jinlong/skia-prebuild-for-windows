# Skia Win Build

## 1.Setup

### 0. Tool

```shell
pnpm i
```

### 1. Venv

- 创建`python`虚拟环境
- 复制虚拟环境`python`为`python3`
- 验证`./tool venv`

### 2. 依赖

`ninja`虚拟环境中执行

```shell
python3 bin/fetch-ninja
```

更新依赖（无需虚拟环境）

```shell
./tool update
```

需要系统路径命令：
- `ninja`

## 2. Build

默认`msvc-static-release-MT`

```shell
./tool gen
```

```shell
./tool build -o <dir>
```

### 示例：

生成：

```shell
./tool gen -d
```

```shell
./tool gen --shared -r MD
```

```shell
./tool gen --msvc-version <v>
```

```shell
./tool gen --sdk-version <v>
```

构建：

```shell
./tool build -o msvc-shared-release-MT
```

```shell
./tool build -c skia -o msvc-shared-release-MT
```

带安装：

```shell
./tool build -i -o msvc-shared-release-MT
```

```shell
./tool build -i -d path_to_install -o msvc-shared-release-MT
```
