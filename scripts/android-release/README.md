# Android SDK publication

Prepare `jp.rdlabo:workers-native-android` for Maven Central independently of a
Capacitor application. This build uses the existing native library and Gradle
wrapper. It does not upload or publish anything externally.

## Prerequisites

- Java 21 and Android SDK 36 (`JAVA_HOME` and `ANDROID_HOME`).
- A Central Portal account with the verified `jp.rdlabo` namespace.
- A GPG signing key whose public key is discoverable as required by Central.

Follow the official [registration](https://central.sonatype.org/register/central-portal/)
and [publication requirements](https://central.sonatype.org/publish/requirements/).
The npm Trusted Publisher connection does not grant Maven Central access.

## Validate locally without credentials

From the repository root:

```sh
demo/android/gradlew -p scripts/android-release \
  :workers:publishReleasePublicationToStagingRepository

demo/android/gradlew -p demo/tests/native-embedding/android \
  -PsdkRepository="$PWD/scripts/android-release/build/repository" \
  :app:assembleDebug
```

The consumer resolves the AAR and its transitive dependencies without including
SDK source. The native embedding CI additionally runs `python3 scripts/android-release/verify.py`
with a disposable GPG key to build and verify the signed bundle, then builds this
consumer. The verification script requires `gpg` and deletes its test-key ZIP. Staging output is
under `scripts/android-release/build/repository`; it includes the AAR, POM,
Gradle metadata, sources, Javadoc and checksums. Android and npm versions must
match. Unsigned staging is for local verification only.

## Prepare a signed bundle

Use the reviewed release revision, matching the intended npm/native SDK version.
Provide `MAVEN_SIGNING_KEY` (ASCII-armored private key) and
`MAVEN_SIGNING_PASSWORD` through your local secret manager or CI secrets. Do not
put private keys or passwords in commands, source files or logs. The public key
must be available to Central before validation.

```sh
demo/android/gradlew -p scripts/android-release \
  -PsignRelease centralBundle
```

The ZIP is created in `scripts/android-release/build/distributions/`. It contains
only the current version's Maven directory. The task requires signing; it never
uploads automatically. Use a clean staging directory for each release candidate.

## Validate and publish in Central Portal

After reviewing the bundle and authorizing publication, upload it through the
[Central Portal](https://central.sonatype.com/publishing). Wait for validation,
review any errors, then explicitly publish the deployment. Published versions
cannot be replaced. CI success and local staging do not establish that a version
is publicly available.

After Central reports publication, build an independent consumer using only
`google()` and `mavenCentral()` and the exact published coordinate. Verify the
native flow before changing user documentation to claim public availability.
Until that succeeds, the existing local-publication instructions remain valid.
