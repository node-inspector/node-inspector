#!/bin/bash

FILE=""
NULL="/dev/null"
LIST=false
TAG=$(node -e "console.log(require('./package.json').version)")
tmp="$TMPDIR/changelog"

if [ "$(expr substr $(uname -s) 1 10)" == "MINGW32_NT" ]; then
  NULL="NUL";
  tmp="._changelog"
fi

while [ "$1" != "" ]; do
  case $1 in
    -l | --list )
      LIST=true
      ;;
    -t | --tag )
      TAG=$2
      shift
      ;;
    * )
      FILE=$1
      ;;
  esac
  shift
done

DATE=`date +'%Y-%m-%d'`
HEAD="## $DATE, Version $TAG\n\n"

if $LIST; then
  printf "$HEAD"
  lasttag=$(git rev-list --tags --max-count=1 2>$NULL)
  version=$(git describe --tags --abbrev=0 $lasttag 2>$NULL)
  export GIT_PAGER=cat # disable pager when running interactively
  if test -z "$version"; then
    git log --no-merges --pretty="format: * %s (%an)%n"
  else
    git log --no-merges --pretty="format: * %s (%an)%n" $version..
  fi
  exit
fi

CHANGELOG=$FILE
if test "$CHANGELOG" = ""; then
  CHANGELOG=`ls | egrep 'change|history' -i|head -n1`
  if test "$CHANGELOG" = ""; then
    CHANGELOG='History.md';
  fi
fi

$0 --list >> $tmp
printf '\n' >> $tmp
if [ -f $CHANGELOG ]; then echo "" >> $tmp; cat $CHANGELOG >> $tmp; fi
mv $tmp $CHANGELOG
test -n "$EDITOR" && $EDITOR $CHANGELOG
