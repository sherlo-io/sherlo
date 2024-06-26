#!/bin/bash

# Runs the "sherlo-eas-build-on-success" or "sherlo-cli" script

# Get the directory of the current script
DIR=$(dirname "$0")

# The first command-line argument is stored in $1
ARGUMENT=$1

if [ "$ARGUMENT" = "eas-build-on-success" ]; then
    # Shift the arguments by one to remove the first argument ('eas-build-on-success')
    shift
    
    $DIR/sherlo-eas-build-on-success "$@"
else
    node $DIR/sherlo-cli "$@"
fi
