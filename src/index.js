'use strict';

const url = require('url'),
    _ = require('lodash'),
    userHome = require('user-home'),
    path = require('path'),
    Configstore = require('configstore'),
    properties = require('properties'),
    fs = require('fs'),
    _s = require('underscore.string'),
    chalk = require('chalk'),
    glob = require('glob'),
    Generator = require('yeoman-generator');

/**
 * Main features:
 *  - Fixes target folder selection (for example, if project name different from current folder, generate inside subfolder)
 *  - Fixes work with stored answers including correct globals support (and proper answers storage)
 *  - Support for update mode (recognition)
 *  - Utilities to work with template (to avoid copying templates one by one)
 */
module.exports = class JavaGenerator extends Generator {

    /**
     * Fixed this.appname yeoman property from special characters, spaces and accents.
     * Loads global config (stored in user home). Global configs are helpful for storing user answers which will be the same
     * for different generator launches.
     *
     * If generator appname property matches current folder then generate there, otherwise create new folder
     * and run generation in subfolder.
     *
     * @param args arguments
     * @param opts options
     * @param pkgJson loaded package.json (require('package.json'))
     * @constructor
     */
    constructor(args, opts, pkgJson) {
        super(args, opts);
        // isolated helper scope with global configuration
        this.$scope = {
            pkgJson: pkgJson,
            globalConfig: new Configstore(pkgJson.name)
        };
        // yeoman replace '-' with space! fixing name
        this.appname = this.$folderName(this.appname);
    }

    // --------------------------------------------------------------- CONFIGS

    /**
     * Initialize questions. This is important fro update mode: most likely user will have all answers in .yo-rc.json.
     * All properties are loaded from yo-rc json and set as generator properties (this is not beautiful, but
     * required if you want to use them directly in templates).
     *
     * Also creates extra object:
     *  context {
     *      allAnswered: false,
     *      updateMode: false,
     *      pkg: parsed package.json,
     *      usedGeneratorVersion: string
     *  }
     * - allAnswered set when all questions are answered. Example case: new generator version may contain new question
     * - updateMode set when at least one answer exists (obviously it means that yo-rc.json exists with data for
     * this generator)
     * - pkg is parsed package json (sometimes required for name or other properties)
     * - usedGeneratorVersion generator version, used for previous generation (property stored in yo-rc.json)
     *
     * @param questions list of properties used as prompt properties
     */
    $initConfig(questions) {
        // if all questions answered no need to ask again
        const config = this.config,
            context = this.context = {
                allAnswered: true,
                updateMode: false,
                pkg: this.$scope.pkgJson,
                usedGeneratorVersion: config.get('usedGeneratorVersion')
            };

        // read stored configuration to not ask questions second time
        questions.forEach(name => {
            let val = config.get(name);
            this[name] = val;
            if (_.isUndefined(val)) {
                context.allAnswered = false;
            } else {
                // config exist
                context.updateMode = true;
            }
        });
    }

    /**
     * Resolves correct default value to use in prompt.
     * Checks: stored answers, global answers, provided default
     *
     * @param name property key
     * @param value default value
     * @return default value
     */
    $defaultValue(name, value) {
        const localConfigValue = this.config.get(name);
        return localConfigValue || this.$scope.globalConfig.get(name) || value;
    }

    /**
     * Store global property (in global config file)
     *
     * @param name property key
     * @param value property value
     */
    $storeGlobal(name, value) {
        this.$scope.globalConfig.set(name, value);
    }

    /**
     * Sets prompt answers as properties to generator object (to be able to use in templates)
     *
     * @param props prompt answers
     * @param questions questions properties list
     */
    $applyAnswers(props, questions) {
        questions.forEach(name => {
            let val = props[name];
            if (!_.isUndefined(val)) {
                this[name] = val;
            }
        });
    }

    /**
     * Enhanced version for yo prompt. Will call prompt and then apply answers with applyAnswers.
     *
     * @param prompts prompts list
     * @param questions questions properties list
     */
    $prompt(prompts, questions) {
        return this.prompt(prompts).then(props => {
            this.$applyAnswers(props, questions);
            this.log(); // empty line
            return props;
        });
    }

    /**
     * Store user answers in yo-rc.json (be default answers not stored there) and save global answers into
     * global config file.
     *
     * Globals are saved to be used by new generations (e.g. user name, email etc are specific for user and most likely
     * for all generator runs).
     *
     * @param questions questions properties list
     * @param globals global properties list
     */
    $saveConfiguration(questions, globals) {
        const config = this.config;
        // store yo-rc.json
        config.save();
        questions.forEach(name => {
            let val = this[name];
            config.set(name, val);
            if (globals.includes(name)) {
                this.$storeGlobal(name, val);
            }
        });
        config.set('usedGeneratorVersion', this.context.pkg.version);
    }

    // -------------------------------------------------------------------------------- INIT

    /**
     * Init date variables to use in templates:
     * - year : e.g. '2015'
     * - date : today date, e.g. '1.12.2015' (useful for javadoc if using like @since date)
     * - reverseDate : reversed date. e.g. '2015-12-01' (useful fro changelog)
     */
    $initDateVars() {
        // init date variables for templates
        const d = new Date(),
            monthStr = this.$twoDigits(d.getMonth() + 1);

        this.year = d.getFullYear();
        this.date = `${d.getDate()}.${monthStr}.${d.getFullYear()}`;
        this.reverseDate = `${d.getFullYear()}-${monthStr}-${this.$twoDigits(d.getDate())}`;
    }

    /**
     * Retrieve github data using user name.
     * Returned:
     * {
     *  name: User full name,
     *  email: user email
     * }
     *
     * @param inputUser user name
     * @param callback callback function with (err, res)
     */
    $getGithubData(inputUser, callback) {
        if (!this.$scope.github) {
            /* jshint -W106 */
            const proxy = process.env.http_proxy || process.env.HTTP_PROXY || process.env.https_proxy ||
                process.env.HTTPS_PROXY || null;
            /* jshint +W106 */
            const githubOptions = {
                // debug: true,
                protocol: 'https'
            };

            if (proxy) {
                const proxyUrl = url.parse(proxy);
                githubOptions.proxy = {
                    host: proxyUrl.hostname,
                    port: proxyUrl.port
                };
            }

            const GitHubApi = require('@octokit/rest');
            this.$scope.github = new GitHubApi(githubOptions);
        }
        this.$scope.github.users.getByUsername({
            username: inputUser
        }).then(({data}) => {
            callback(null, JSON.parse(JSON.stringify(data)));
        }).catch(() => {
            callback(`Cannot fetch your github profile ${chalk.red(inputUser)}. Make sure you\'ve typed it correctly.`);
        });
    }


    // -------------------------------------------------------------------------- UTIL

    /**
     * Formats number in two digit format, appending leading 0 for numbers < 10.
     *
     * @param num number
     * @returns {string} two digit number string
     */
    $twoDigits(num) {
        return num < 10 ? `0${num}` : num;
    }

    /**
     * Converts free user input into valid folder name.
     * For example, user inputs 'some lib' then folder name will be 'some-lib'
     *
     * Use slugify function to replace spaces and remove accents and special characters.
     *
     * @param name free folder name
     * @returns {string} valid folder name
     */
    $folderName(name) {
        return _s.slugify(name).toLowerCase();
    }

    /**
     * Validates java package.
     *
     * @param pkg package to validate
     * @returns true if package valid, false otherwise
     */
    $validatePackage(pkg) {
        if (/^([a-z_]{1}[a-z0-9_]*(\.[a-z_]{1}[a-z0-9_]*)*)$/.test(pkg)) {
            return true;
        }
        return 'The package name you have provided is not a valid Java package name.';
    }

    /**
     * Selects if generation must be done in current folder or in new subfolder.
     */
    $selectTargetFolder() {
        // choose to generate in current folder or in subfolder (according to appname)
        if (this.appname !== _.last(this.destinationRoot().split(path.sep))) {
            this.destinationRoot(this.appname);
        }
    }

    /**
     * Use appname to generate java class prefix specific for project.
     * For example, if project name is 'sample-project' then class prefix will be
     * SampleProject.
     * This is useful for generation of project specific classes.
     * For example SampleProjectApplication.
     * @param name name to generate prefix from (in some cases will be generator.appname)
     *
     * @returns {string} project specific class prefix
     */
    $generateProjectClassPrefix(name) {
        return _.upperFirst(_.camelCase(this.$folderName(name)));
    }

    /**
     * Format entered tags list like: one,two
     * into: 'one', 'two'
     * And result can be used in build configuration.
     *
     * @param tagsInput comma separated tags string
     * @returns {string} quoted tags list
     */
    $quoteTagsList(tagsInput) {
        return !tagsInput ? '' : tagsInput.split(/\s*,\s*/).map(tag => `'${tag.trim()}'`).join(', ');
    }

    /**
     * It is not possible in yeoman to run sub generator in sub directory (composeWith will run in the same directory).
     * So we have to run sub generator as separate process.
     *
     * @param genName generator name
     * @param appname application name (some generators supports appname as first argument)
     * @param dir target directory
     * @param options (object) options to pass to generator
     */
    $runGenerator(genName, appname, dir, options) {
        // if this file will not be created in target dir yeoman will find parent file and complain
        this.$touch(dir + '/.yo-rc.json');
        const opts = [genName, appname, '--skip-welcome-message']; // last one is specific for gulp-angular generator
        options.forEach((val, name) => opts.push('--' + name + '=' + val));
        const setts = {stdio: 'inherit'};
        if (dir) {
            setts.cwd = dir;
        }
        const done = this.async();
        this.spawnCommand('yo', opts, setts)
            .on('close', () => done());
    }

    // --------------------------------------------------------------------- FILES

    /**
     * Resolves file path in user home dir.
     *
     * @param filePath fle path relative to user home
     * @returns absolute path to file
     */
    $resolveFileFromUserHome(filePath) {
        const targetPath = filePath,
            configFile = targetPath ? path.join(userHome, targetPath) : userHome;
        return path.normalize(configFile);
    }

    /**
     * Read properties file. Returns null (on error or when file not exist) or read properties object.
     *
     * @param filePath absolute file path
     * @param callback callback for resolved properties
     */
    $readProperties(filePath, callback) {
        if (fs.existsSync(filePath)) {
            properties.parse(filePath, {path: true}, (error, obj) => {
                callback(error ? null : obj);
            });
        } else {
            callback(null);
        }
    }

    /**
     * Read banner file into string.
     * For example: readBanner('banner.txt')
     *
     * @param filePath path to banner file (relative to templates folder)
     * @returns {string} banner file as string
     */
    $readBanner(filePath) {
        return fs.readFileSync(this.templatePath(filePath)).toString();
    }

    /**
     * Check file existence in generation directory. Useful for project updates.
     *
     * @param filePath file path relative to generation directory
     * @returns true when file exists in generation directory
     */
    $exists(filePath) {
        return fs.existsSync(this.destinationPath(filePath));
    }

    /**
     * Unix like touch (create empty file if not exist or do nothing).
     *
     * @param filePath
     */
    $touch(filePath) {
        if (!this.$exists(filePath)) {
            fs.closeSync(fs.openSync(this.destinationPath(filePath), 'w'));
        }
    }

    /**
     * Marks file as executable (Linux).
     *
     * @param filePath target file path relative to generation folder.
     */
    $setExecutableFlag(filePath) {
        fs.chmodSync(this.destinationPath(filePath), '755');
    }

    // ----------------------------------------------------------------------------- TEMPLATES

    /**
     * Supported options:
     * glob - glob pattern, by default '**'
     * targetFolder - target folder (subfolder)
     * processDotfiles - replace file names started with '_' to '.', default true
     * writeOnceFiles - array of target files which must not be overridden (write once, usually on initial generation), default []
     * pathReplace - array of replace objects : {regex: , replace:} to replace parts of original path to get target path
     * @param copyFn function used for actual copy
     * @param dir templates source directory
     * @param options options object
     */
    $smartCopy(copyFn, dir, options) {
        const opts = options || {};
        _.defaults(opts, {
            glob: '**',
            processDotfiles: true,
            writeOnceFiles: [],
            pathReplace: []
        });
        if (opts.targetFolder && !_s.endsWith(opts.targetFolder, '/')) {
            opts.targetFolder = opts.targetFolder + '/';
        }
        if (!_s.endsWith(dir, '/')) {
            dir += '/';
        }
        glob.sync(opts.glob, {cwd: this.templatePath(dir), nodir: true}).map(file => {
            let targetFile = file;
            if (opts.processDotfiles) {
                targetFile = targetFile.replace(/^_|\/_/, '/.'); // replace _ to  .
            }
            if (opts.targetFolder) {
                targetFile = opts.targetFolder + targetFile;
            }
            targetFile = targetFile.replace(/^\//, ''); // remove trailing slash

            opts.pathReplace.forEach(desc => targetFile = targetFile.replace(desc.regex, desc.replace));

            const dest = this.destinationPath(targetFile);
            if (opts.writeOnceFiles.includes(targetFile) && fs.existsSync(dest)) {
                this.log(chalk.yellow('     skip ') + path.normalize(targetFile));
                return;
            }
            const source = this.templatePath(dir + file);
            copyFn(source, dest);
        }, this);
    }

    /**
     * Copy files to destination without template processing.
     * Automatically renames _smth files to .smth (using _ in templates is important to avoid false recognition for
     * special files)
     *
     * @param dir directory relative to templates folder
     * @param options smartCopy options (see above)
     */
    $copy(dir, options) {
        this.$smartCopy(this.fs.copy.bind(this.fs), dir, options);
    }

    /**
     * Copy files to destination with template processing.
     * Automatically renames _smth files to .smth (using _ in templates is important to avoid false recognition for
     * special files)
     *
     * @param dir dir directory relative to templates folder
     * @param options smartCopy options (see above)
     */
    $copyTpl(dir, options) {
        this.$smartCopy((src, dest) => this.fs.copyTpl(src, dest, this), dir, options);
    }

    /**
     * Copies source files. Replace folder named 'package' into provided base package.
     * For example, suppose templates contain
     * templates/
     *     src/
     *       package/
     *          Claz.java
     *
     * Resulted structure will be (suppose base package 'com.example'):
     * {destination}/
     *      src/
     *          com/
     *              example/
     *                  Claz.java
     *
     * All files are processed as templates.
     *
     * @param basePackage base package (e.g. 'com.example')
     * @param templatesDir directory with templates to copy, relative to templates dir
     * @param pathReplace optional array with additional pathReplace regexps (see smartCopy)
     */
    $copySources(basePackage, templatesDir, pathReplace) {
        const packageFolder = basePackage.replace(/\./g, '/');
        this.$copyTpl(templatesDir, {
            pathReplace: [
                {regex: /(^|\/)package(\/|$)/, replace: '$1' + packageFolder + '$2'}
            ].concat(pathReplace || [])
        });
    }

    /**
     * Special version of copySources. Do the same but also rename all files starting with Project
     * with application name.
     * For example, application name is 'sample-app' then app prefix is SampleApp.
     * And, for example, file ProjectApplication.java will be renamed as SampleAppApplication.java.
     *
     * @param basePackage base package (e.g. 'com.example')
     * @param templatesDir directory with templates to copy, relative to templates dir
     * @param pathReplace optional array with additional pathReplace regexps (see smartCopy)
     */
    $copySourcesRenamingProjectClasses(basePackage, templatesDir, pathReplace) {
        this.$copySources(basePackage, templatesDir, [
            {regex: /\/Project/, replace: '/' + this.$generateProjectClassPrefix(this.appname)}
        ].concat(pathReplace || []));
    }
};
