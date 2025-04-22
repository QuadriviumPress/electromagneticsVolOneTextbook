#!/bin/bash

for file in $PWD/*.eps
	do
		filename=$(basename "$file")
		inkscape "$file" --export-dpi=350 --export-text-to-path --export-eps="$PWD"/"${filename%.eps}.eps"
	done
