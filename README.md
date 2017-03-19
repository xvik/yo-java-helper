# Yeoman helper for Java generators

[![License](http://img.shields.io/badge/license-MIT-blue.svg)](http://www.opensource.org/licenses/MIT)
[![NPM version](http://img.shields.io/npm/v/yo-java-helper.svg)](http://badge.fury.io/js/yo-java-helper)
[![Build Status](https://secure.travis-ci.org/xvik/yo-java-helper.png)](https://travis-ci.org/xvik/yo-java-helper)

### About

Contains commonly required functionality for java generators.

Main features:
 * Fixes target folder selection (for example, if project name different from current folder, generate inside subfolder)
 * Fixes work with stored answers:
    - correct globals support
    - proper answers storage inside yo-rc.json
    - proper questions default selection
 * Support for update mode (update recognition)
 * Template utilities:
    - Copy folders instead with additional pre-processing (e.g. correct package folders generation)
    - Dot files support (.gitignore, .travis.yml etc)
    - Files rename support (e.g. to properly name application specific classes)

### Used by

* [Java lib generator](https://github.com/xvik/generator-lib-java)
* [Gradle plugin generator](https://github.com/xvik/generator-gradle-plugin)
