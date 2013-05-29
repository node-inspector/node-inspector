#!/bin/bash

gjslint \
 --nojsdoc --max_line_length=105 \
 -r lib -r front-end/node -r test \
| grep -v "No docs found for member '" # fix --nojsdoc bug in v2.3.10
