# Android CI Image

`ci/android/Dockerfile` builds a Docker image for building the Conduit
Android app in CI. It is based on `node:20-bookworm` and adds:

- OpenJDK 17
- Android SDK command-line tools, platform-tools, platform 35,
  build-tools 35.0.0, CMake 3.22.1, and NDK 27.1.12297006

Build it with:

```sh
docker buildx build --platform linux/amd64 -f ci/android/Dockerfile -t conduit/android-ci:node20-android35 .
```

Push it to the container registry of your choice and point your CI
configuration at the resulting image.
