#!/bin/bash

# Get the directory of the current script
DIR=$(dirname "$0")

# The first command-line argument is stored in $1
ARGUMENT=$1

if [ "$ARGUMENT" = "eas-build-on-complete" ]; then
    # Shift the arguments by one to remove the first argument ('eas-build-on-complete')
    shift
    
    $DIR/sherlo-eas-build-on-complete "$@"
else
    node $DIR/sherlo-cli "$@"
fi
