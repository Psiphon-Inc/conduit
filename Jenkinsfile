pipeline {

    agent { label 'linux' }

    options {
        buildDiscarder(logRotator(artifactDaysToKeepStr: '30', artifactNumToKeepStr: '10'))
    }

    stages {
        stage('Android bundle AAB') {

            agent { label 'linux' }

            when {
                tag "release-android-*";
            }

            environment {
                ANDROID_PSIPHON_CONFIG = 'op://Jenkins/Conduit Psiphon Config/android_psiphon_config'
                ANDROID_EMBEDDED_SERVER_ENTRIES = 'op://Jenkins/Conduit Psiphon Config/android_embedded_server_entries'
                ANDROID_UPLOAD_KEYSTORE = 'op://Jenkins/Conduit Upload Signing Key/upload-keystore.jks.base64'
                ANDROID_UPLOAD_KEYSTORE_PROPERTIES = 'op://Jenkins/Conduit Upload Signing Key/keystore.properties'
            }
            
            steps {

                sh 'npm ci'
               
                script {
                    releaseName = TAG_NAME.minus("release-android-")
                }

                writeFile file: 'src/git-hash.js', text: "export const GIT_HASH = '${releaseName}';"

                dir('android') {

                    withSecrets() {
                        writeFile file: 'app/src/main/res/raw/psiphon_config', text: env.ANDROID_PSIPHON_CONFIG
                        writeFile file: 'app/src/main/res/raw/embedded_server_entries', text: env.ANDROID_EMBEDDED_SERVER_ENTRIES
                        writeFile file: 'app/upload-keystore.jks', text: env.ANDROID_UPLOAD_KEYSTORE, encoding: "Base64"
                        writeFile file: 'keystore.properties', text: env.ANDROID_UPLOAD_KEYSTORE_PROPERTIES
                    }

                    sh './gradlew clean bundleRelease'

                    sh "mv app/build/outputs/bundle/release/app-release.aab app/build/outputs/bundle/release/conduit-${releaseName}.aab"
                }

                archiveArtifacts artifacts: 'android/app/build/outputs/bundle/release/*.aab', fingerprint: true, onlyIfSuccessful: true

            }
        }
        
        stage('iOS IPA') {

            agent { label 'mac-mini-node2' }

            when {
                tag "release-ios-*";
            }

            environment {
                // TODO: These are large values that can cuase sh directives to fail with "Argument list too long".
                IOS_PSIPHON_CONFIG = 'op://Jenkins/Conduit Psiphon Config/ios_psiphon_config'
                IOS_EMBEDDED_SERVER_ENTRIES = 'op://Jenkins/Conduit Psiphon Config/ios_embedded_server_entries'

                // Required for our sudo-less Cocoapods installation.
                PATH = "${env.HOME}/.gem/bin:${env.PATH}"

                // Required by Cocoapods.
                LANG = "en_US.UTF-8"
            }

            steps {
                sh 'echo "PATH: $PATH"'
                sh 'echo "Node version: $(node --version)"'
                sh 'echo "NPM version: $(npm --version)"'
                sh 'echo "Xcodebuild version:\n$(xcodebuild -version)"'

                sh 'npm ci'

                script {
                    releaseName = TAG_NAME.minus("release-ios-")
                }

                writeFile file: 'src/git-hash.js', text: "export const GIT_HASH = '${releaseName}';"

                dir('ios') {

                    // Loads credential "mac-pro-build build user" from Jenkins.
                    // (usernameVariable must be present to avoid a bug in the plugin).
                    withCredentials([usernamePassword(credentialsId: '2e8830e4-ff4e-4876-b939-875e5aea611e', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                        // Use single quotes to avoid Groovy interpolation of secrets.
                        sh 'security unlock-keychain -p "${PASSWORD}" /Users/build/Library/Keychains/login.keychain-db'
                    }

                    withSecrets() {
                        writeFile file: 'ios_psiphon_config', text: env.IOS_PSIPHON_CONFIG
                        writeFile file: 'ios_embedded_server_entries', text: env.IOS_EMBEDDED_SERVER_ENTRIES
                    }

                    sh 'pod install --repo-update'

                    sh 'xcodebuild archive -workspace ./conduit.xcworkspace -scheme conduit -configuration Release -sdk iphoneos -archivePath ./build/conduit.xcarchive -allowProvisioningUpdates'

                    sh 'xcodebuild -exportArchive -archivePath ./build/conduit.xcarchive -exportOptionsPlist exportAppStoreOptions.plist -exportPath ./build -allowProvisioningUpdates'

                    sh "mv ./build/Conduit.ipa ./build/Conduit-${releaseName}.ipa"
                }

                archiveArtifacts artifacts: 'ios/build/*.ipa', fingerprint: true, onlyIfSuccessful: true

            }
        }

    }

    post {
        always {
            dir('client') {
                // This is very large, save space on jenkins
                sh 'rm -rf node_modules'
            }
        }
        failure {
            script {
                changes = getChangeList()
            }
            slackSend message:"${env.JOB_NAME} - Build #${env.BUILD_NUMBER} failed (<${env.BUILD_URL}|Open>)\nChanges:\n${changes}",
                      color: "danger"
        }
    }
}

String getChangeList() {
    if (currentBuild.changeSets.size() == 0) {
        return "No changes"
    }

    def changeList = ""
    for (changeSet in currentBuild.changeSets) {
        for (entry in changeSet.items) {
            changeList += "- ${entry.msg} [${entry.authorName}]\n"
        }
    }

    return changeList
}
