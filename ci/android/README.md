# Android GitLab CI

Build and push the Android CI image before enabling release-tag builds:

```sh
docker buildx build --platform linux/amd64 --push -f ci/android/Dockerfile -t docker.psiphon.io/conduit/android-ci:node20-android35 .
```

The default `.gitlab-ci.yml` image is `docker.psiphon.io/conduit/android-ci:node20-android35`. Override `ANDROID_CI_IMAGE` in GitLab CI/CD variables if you push the image somewhere else.

Required GitLab setup:

- Add a protected, masked, hidden `OP_SERVICE_ACCOUNT_TOKEN` CI/CD variable.
- Register a protected Docker runner tagged `docker`.
- Protect the `release-android-*` tag pattern.
- Create release tags like `release-android-2.1.3` to produce an AAB artifact.
