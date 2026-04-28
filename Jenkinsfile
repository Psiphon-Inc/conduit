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
                HOSTED_BASE_URL = 'op://Jenkins/Conduit Hosted Config/hosted_base_url'
                CLERK_PUBLISHABLE_KEY = 'op://Jenkins/Conduit Hosted Config/clerk_publishable_key'
                CLERK_HCB_JWT_TEMPLATE = 'op://Jenkins/Conduit Hosted Config/clerk_hcb_jwt_template'
                REVENUECAT_ANDROID_PUBLIC_KEY = 'op://Jenkins/Conduit Hosted Config/revenuecat_android_public_key'
            }
            
            steps {

                sh 'npm ci'
                
                script {
                    env.RELEASE_NAME = TAG_NAME.minus("release-android-")
                }

                writeFile file: 'src/git-hash.ts', text: "export const GIT_HASH = '${env.RELEASE_NAME}';"

                withSecrets() {
                    writeFile file: '.env.production', text: [
                        "EXPO_PUBLIC_HOSTED_BASE_URL=${env.HOSTED_BASE_URL}",
                        "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${env.CLERK_PUBLISHABLE_KEY}",
                        "EXPO_PUBLIC_CLERK_HCB_JWT_TEMPLATE=${env.CLERK_HCB_JWT_TEMPLATE}",
                        "EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_KEY=...",
                        "EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY=${env.REVENUECAT_ANDROID_PUBLIC_KEY}",
                    ].join('\n')
                }

                dir('android') {
                    sh 'mkdir -p ../modules/expo-psiphon-tunnel-core/android/src/main/res/raw'

                    withSecrets() {
                        writeFile file: '../modules/expo-psiphon-tunnel-core/android/src/main/res/raw/android_psiphon_config', text: env.ANDROID_PSIPHON_CONFIG
                        writeFile file: '../modules/expo-psiphon-tunnel-core/android/src/main/res/raw/android_embedded_server_entries', text: env.ANDROID_EMBEDDED_SERVER_ENTRIES
                        writeFile file: 'app/upload-keystore.jks', text: env.ANDROID_UPLOAD_KEYSTORE, encoding: "Base64"
                        writeFile file: 'keystore.properties', text: env.ANDROID_UPLOAD_KEYSTORE_PROPERTIES
                    }

                    sh './gradlew clean bundleRelease'

                    sh "mv app/build/outputs/bundle/release/app-release.aab app/build/outputs/bundle/release/conduit-${env.RELEASE_NAME}.aab"
                }

                archiveArtifacts artifacts: 'android/app/build/outputs/bundle/release/*.aab', fingerprint: true, onlyIfSuccessful: true

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
                def changes = getChangeList()
                slackSend message:"${env.JOB_NAME} - Build #${env.BUILD_NUMBER} failed (<${env.BUILD_URL}|Open>)\nChanges:\n${changes}",
                          color: "danger"
            }
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
