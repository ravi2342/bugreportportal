// ========================================
// Bug Report Portal - PR Validation Pipeline
// ========================================
// Runs on pull requests to master. Validates code quality and security
// BEFORE merge. No build, no push, no deploy — those run from the
// devops repo's Jenkinsfile after merge to master.
//
// Configured as a Jenkins Multibranch Pipeline pointing at this repo;
// PRs are auto-discovered and results posted as GitHub status checks.
// ========================================

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
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

    stage('Install Dependencies') {
      steps {
        sh '''
          set -e
          node --version
          npm --version
          npm ci --no-audit --no-fund
        '''
      }
    }

    stage('Lint') {
      steps {
        sh 'npm run lint'
      }
    }

    stage('Tests') {
      steps {
        sh '''
          set -e
          npm test -- --coverage --ci \
            --coverageReporters=lcov \
            --coverageReporters=text \
            --coverageReporters=text-summary
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true, fingerprint: false
        }
      }
    }

    stage('SonarQube PR Scan') {
      when {
        expression { return params.RUN_SONAR && params.SONAR_HOST_URL?.trim() }
      }
      steps {
        withCredentials([string(credentialsId: params.SONAR_TOKEN_CREDENTIALS_ID, variable: 'SONAR_TOKEN')]) {
          script {
            def scannerAvailable = sh(
              script: 'command -v sonar-scanner >/dev/null 2>&1',
              returnStatus: true
            ) == 0
            if (!scannerAvailable) {
              echo "⚠ sonar-scanner not installed on agent - skipping"
              return
            }

            // Static project properties (sources, exclusions, coverage path)
            // come from sonar-project.properties in the repo root. We only
            // override host/token and add PR-specific keys here.
            def prArgs = ''
            if (env.CHANGE_ID) {
              prArgs = "-Dsonar.pullrequest.key=${env.CHANGE_ID} " +
                       "-Dsonar.pullrequest.branch=${env.CHANGE_BRANCH} " +
                       "-Dsonar.pullrequest.base=${env.CHANGE_TARGET}"
            } else if (env.BRANCH_NAME) {
              prArgs = "-Dsonar.branch.name=${env.BRANCH_NAME}"
            }

            sh """
              set -e
              sonar-scanner \\
                -Dsonar.host.url=${params.SONAR_HOST_URL} \\
                -Dsonar.projectKey=${params.SONAR_PROJECT_KEY} \\
                -Dsonar.token=\${SONAR_TOKEN} \\
                -Dsonar.qualitygate.wait=true \\
                -Dsonar.qualitygate.timeout=300 \\
                ${prArgs}
            """
          }
        }
      }
    }

    stage('Trivy Security Scan') {
      steps {
        sh """
          set -e
          docker run --rm \\
            -v \$PWD:/src \\
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
