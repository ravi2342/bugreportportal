// ========================================
// Bug Report Portal - PR Validation Pipeline
// ========================================
// Runs on pull requests to master. Validates code quality and security
// BEFORE merge. No build, no push, no deploy — those run from the
// devops repo's Jenkinsfile after merge to master.
//
// Reuses the same shared library as the devops Jenkinsfile (pinned to
// v1.1) so PR scans and master scans run identical commands. The PR
// code is checked out into ./app/ to match the workspace layout the
// shared-lib functions expect (workDir defaults to 'app').
//
// Configured as a Jenkins Multibranch Pipeline; PRs are auto-discovered
// and results posted as GitHub status checks.
// ========================================

@Library('bug-report-portal-lib@v1.1') _

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    // We do our own checkout into app/ to mirror the layout the shared
    // library expects. Without this, Jenkins would checkout at the
    // workspace root and shared-lib `cd app` calls would fail.
    skipDefaultCheckout(true)
  }

  parameters {
    booleanParam(name: 'RUN_SONAR', defaultValue: true,
      description: 'Run SonarQube PR analysis')
    string(name: 'SONAR_HOST_URL', defaultValue: 'http://sonarqube:9000',
      description: 'SonarQube URL')
    string(name: 'SONAR_PROJECT_KEY', defaultValue: 'bug-report-portal',
      description: 'SonarQube project key')
    string(name: 'SONAR_TOKEN_CREDENTIALS_ID', defaultValue: 'sonar-token',
      description: 'Jenkins credentials ID for the Sonar token')
    string(name: 'TRIVY_VERSION', defaultValue: '0.71.0',
      description: 'Trivy image tag for the fs scan')
  }

  environment {
    CI = 'true'
  }

  stages {

    stage('Info') {
      steps {
        script {
          def isPR = env.CHANGE_ID ? true : false
          currentBuild.displayName = isPR ?
            "#${BUILD_NUMBER} - PR-${env.CHANGE_ID} -> ${env.CHANGE_TARGET}" :
            "#${BUILD_NUMBER} - ${env.BRANCH_NAME}"
          currentBuild.description = isPR ?
            "PR #${env.CHANGE_ID} (${env.CHANGE_BRANCH} -> ${env.CHANGE_TARGET})" :
            "Branch: ${env.BRANCH_NAME}"
        }
      }
    }

    stage('Clean Workspace') {
      steps {
        deleteDir()
      }
    }

    stage('Checkout Application') {
      steps {
        // `checkout scm` in a multibranch PR job resolves to the PR
        // commit (or branch HEAD for branch builds). Drop it into app/
        // so shared-lib functions like installDeps() and lintAndTest()
        // (which do `cd app && ...`) work unchanged.
        dir('app') {
          checkout scm
        }
      }
    }

    stage('Install Dependencies') {
      steps {
        script {
          installDeps()
        }
      }
    }

    stage('Quality Gates') {
      steps {
        script {
          lintAndTest()
        }
      }
    }

    stage('SonarQube PR Scan') {
      when {
        expression { return params.RUN_SONAR && params.SONAR_HOST_URL?.trim() }
      }
      steps {
        script {
          // Build PR-decoration args dynamically; shared-lib sonarScan
          // accepts these via the `extraArgs` list and appends them to
          // the sonar-scanner invocation.
          def extra = []
          if (env.CHANGE_ID) {
            extra = [
              "-Dsonar.pullrequest.key=${env.CHANGE_ID}",
              "-Dsonar.pullrequest.branch=${env.CHANGE_BRANCH}",
              "-Dsonar.pullrequest.base=${env.CHANGE_TARGET}"
            ]
          } else if (env.BRANCH_NAME) {
            extra = ["-Dsonar.branch.name=${env.BRANCH_NAME}"]
          }

          sonarScan(
            hostUrl: params.SONAR_HOST_URL,
            projectKey: params.SONAR_PROJECT_KEY,
            tokenCredId: params.SONAR_TOKEN_CREDENTIALS_ID,
            waitForQualityGate: true,
            extraArgs: extra
          )
        }
      }
    }

    stage('Trivy Security Scan') {
      steps {
        // Inline fs scan because the shared-lib trivyScan only scans
        // built Docker images; PR builds intentionally do not build
        // images. Reads package-lock.json for HIGH/CRITICAL CVEs.
        sh """
          set -e
          docker run --rm \\
            -v \$PWD/app:/src \\
            aquasec/trivy:${params.TRIVY_VERSION} fs \\
            --scanners vuln \\
            --severity HIGH,CRITICAL \\
            --exit-code 1 \\
            --no-progress \\
            --pkg-types library \\
            /src
        """
      }
    }
  }

  post {
    success {
      echo "✓ PR validation passed - safe to merge"
    }
    failure {
      echo "❌ PR validation failed - fix issues before merging"
    }
    always {
      script {
        echo """
        ╔═══════════════════════════════════════════════════════════════╗
        ║              PR VALIDATION COMPLETE                           ║
        ╠═══════════════════════════════════════════════════════════════╣
        ║ Status:          ${currentBuild.result ?: 'SUCCESS'}
        ║ Build:           #${BUILD_NUMBER}
        ║ Target:          ${env.CHANGE_TARGET ?: env.BRANCH_NAME}
        ║ Duration:        ${currentBuild.durationString}
        ╚═══════════════════════════════════════════════════════════════╝
        """
      }
    }
  }
}
