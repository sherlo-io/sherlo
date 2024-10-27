#!/bin/bash

BASE_PROJECT='testing/expo-storybook-8'
EXCLUDE_IN_EXAMPLES=("package.json" "README.md" "builds" "dist" ".expo" "scripts" ".github")
EXCLUDE_IN_TESTING=("package.json" "README.md" "builds" "dist" ".expo" "metro.config.js")

# Function to update a directory
update_directory() {
  local dir="$1"
  local excludeCopy=("${!2}")
  echo "Updating $dir"

  # Delete existing files in $dir, except excluded ones
  find "$dir" -mindepth 1 -maxdepth 1 | while read item; do
    base_name=$(basename "$item")
    if [[ ! " ${excludeCopy[@]} " =~ " ${base_name} " ]]; then
      rm -rf "$item"
    fi
  done

  # Copy files from BASE_PROJECT to $dir, except excluded ones
  for item in "$BASE_PROJECT"/*; do
    base_name=$(basename "$item")
    if [[ ! " ${excludeCopy[@]} " =~ " ${base_name} " ]]; then
      if [ -d "$item" ]; then
        cp -R "$item" "$dir/"
      else
        cp "$item" "$dir/"
      fi
    fi
  done
}

# Update examples/* directories
for dir in examples/*; do
  if [ -d "$dir" ]; then
    update_directory "$dir" EXCLUDE_IN_EXAMPLES[@]
  fi
done

# Update testing/expo-storybook-7 directory
update_directory "testing/expo-storybook-7" EXCLUDE_IN_TESTING[@]

echo "All examples and testing/expo-storybook-7 updated successfully!"
