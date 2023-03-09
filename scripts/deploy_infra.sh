#!/bin/bash
set -euo pipefail

DEPLOY_TFJSON_PATH=terraform/variables-deploy.tf.json

require_clean_work_tree () {
    # from git-sh-setup.sh: https://www.spinics.net/lists/git/msg142043.html

    # Update the index
    git update-index -q --ignore-submodules --refresh
    err=0

    # Disallow unstaged changes in the working tree
    if ! git diff-files --quiet --ignore-submodules --
    then
        echo >&2 "cannot $0: you have unstaged changes."
        git diff-files --name-status -r --ignore-submodules -- >&2
        err=1
    fi

    # Disallow uncommitted changes in the index
    if ! git diff-index --cached --quiet HEAD --ignore-submodules --
    then
        echo >&2 "cannot $0: your index contains uncommitted changes."
        git diff-index --cached --name-status -r --ignore-submodules HEAD -- >&2
        err=1
    fi

    if [ $err = 1 ]
    then
        echo >&2 "Please commit or stash them."
        exit 1
    fi
}
require_clean_work_tree;

cd "$(git rev-parse --show-toplevel)"

NEXT_REV=$(git rev-parse HEAD)

cat << EOF > "$DEPLOY_TFJSON_PATH"
{
  "//": "This file is generated by scripts/deploy_infra.sh. DO NOT HAND-EDIT!",

  "variable": {
    "api_release_version": {
      "description": "API Release Version",
      "default": "$NEXT_REV"
    },
    "loader_release_version": {
      "description": "Loader Release Version",
      "default": "$NEXT_REV"
    }
  }
}
EOF

git add "$DEPLOY_TFJSON_PATH"
git commit -m "Deploy version $NEXT_REV"

echo -e "\nNew deploy commit created. Don't forget to push it to production and confirm the run on Terraform Cloud."

