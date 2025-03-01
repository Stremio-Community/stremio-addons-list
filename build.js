const fs = require('fs')
const slug = require('./lib/slug')
const needle = require('needle')
const asyncQueue = require('async.queue')
const config = require('./config')
const graphql = require('./lib/graphql')
const getCached = require('./lib/cache')
const processHtml = require('./lib/html')
const issueToMeta = require('./lib/issueToMeta')
const sendDiscordMessage = require('./lib/discord')
const trustedPublishers = require('./trusted_publishers.json')

getCached().then(cached => {
  if (cached.time && cached.time > Date.now() - config['prefer-cached-for']) {
    console.log('cache will be preferred over refreshing manifest data')
    cached.prefer = true
  }
  graphql.getAllPosts().then(data => {
    const addons = []
    const addons_collection = []
    const all_labels = [{ color: 'A08C80', name: 'show all' }]
    const noDups = []
    // issues are ordered chronologically
    data.forEach(addon => {
      const meta = issueToMeta(addon)

      if (meta && meta.name && meta.url) {
        // skip addons that are not approved (yet) by our moderators
        if (!(meta.labels ?? []).some(label => label.id === config['label-id-approved'])) {
          const publisher = (addon.author || {}).login

          // automatically approve addons from trusted publishers
          if (publisher && trustedPublishers.includes(publisher)) {
            console.log(`approving addon '${meta.name}' from trusted publisher '${publisher}'`)
            graphql.syncLabelsQueue.push({ postId: meta.postId, proposedLabels: ['approved'], allLabels: [{ name: 'approved', id: config['label-id-approved'] }] })
          } else {
            console.log(`skipping unapproved addon '${meta.name}'`)
          }

          return
        }
        
        if (meta.score > config['minimum-score']) {
          if (noDups.includes(meta.url)) {
            console.log('closing issue due to duplication: ' + meta.name)
            graphql.closeIssueQueue.push({ postId: meta.postId, label: config['label-id-for-duplicate'] })
            return
          }
          noDups.push(meta.url)
          meta.labels.forEach(label => {
            if (label.name && !all_labels.some(el => label.name === el.name))
              all_labels.push(label)
          })
          addons.push(meta)
        } else {
          console.log('closing issue due to low score: ' + meta.name)
          graphql.closeIssueQueue.push({ postId: meta.postId, label: config['label-id-for-low-score'] })
        }
      } else {
        console.log('closing issue due to submission being invalid: ' + meta.name)
        graphql.closeIssueQueue.push({ postId: meta.postId, label: config['label-id-for-invalid'] })
      }
    })

    // ensure that labels are the same as proposed by user submitting
    addons.forEach(addon => {
      if (addon.postId && addon.proposedLabels.length) {
        const addonLabelNames = addon.labels.map(label => label.name)

        // we only sync labels on approved issues
        if (!addonLabelNames.includes('approved')) {
          console.log(`skipping label sync for unapproved addon '${addon.name}'`)
          return
        }

        const diff = addon.proposedLabels.filter(x => !addonLabelNames.includes(x))

        if (diff.length) {
          // proposed labels are different than issue labels
          console.log('syncing labels for: ' + addon.name)
          console.log(addon.proposedLabels)
          graphql.syncLabelsQueue.push({ postId: addon.postId, proposedLabels: ['approved', ...addon.proposedLabels], allLabels: all_labels })
        }

      }
    })

    const dir = config['build-dir']

    if (!fs.existsSync(dir)) fs.mkdirSync(dir)

    const listHtml = []
    const newAddons = []

    const queue = asyncQueue((task, cb) => {
      const processManifest = (addonManifest, meta, rip) => {
        if (!addonManifest) {
          console.log('warning: could not find addon manifest for: ' + task.name)
          graphql.closeIssueQueue.push({ postId: meta.postId, label: rip ? config['label-id-for-inactive'] : config['label-id-for-unreachable'] })
          cb()
          return
        }
        if (addonManifest.name && addonManifest.name !== meta.name) {
          console.log('warning: github issue name is different than addon name: ' + task.name)
          graphql.updateTitleQueue.push({ postId: meta.postId, title: addonManifest.name })
        }
        addons_collection.push({
          transportUrl: task.url,
          transportName: 'http',
          manifest: addonManifest,
        })
        if (cached.catalog.length && !cached.catalog.find(el => ((el || {}).manifest || {}).id === addonManifest.id)) {
          task.manifest = addonManifest
          newAddons.push(task)
        }
        
        task.labels.pop('approved') // we shouldn't show the "approved" label on the addon page
        let labelsHtml = task.labels.map(el => el.name.split(' ').join('-')).join(' ')
        if (labelsHtml) labelsHtml = ' ' + labelsHtml

        const lowerCaseName = addonManifest.name.toLowerCase()
        const keywordsForAddonPage = config['addon-keywords'].split('{}').join(lowerCaseName)

        const installButton = !(addonManifest.behaviorHints || {}).configurationRequire ? '<a class="addon-button install-button" href="'+task.url.replace('https://','stremio://')+'">Install</a>  <a class="addon-button install-web-button" href="https://web.stremio.com/#/addons?addon='+task.url+'" target="_blank">Install (Web)</a>  <a class="addon-button copy-link-button" href="#" onClick="copyLink(event, \''+task.url+'\')">Copy Link</a>' : '';
        const configButton = (addonManifest.behaviorHints || {}).configurable ? '<a class="addon-button configure-button" href="'+task.url.replace('/manifest.json','/configure')+'" target="_blank">Configure</a>' : ''
        const commentsButton = task.commentCount ? `<a href="${slug(addonManifest.name)}.html" class="addon-button last-addon-button"><ion-icon name="chatbubbles" class="gray-icon"></ion-icon> ${task.commentCount}</a>` : ''
        const language = task.language && task.language !== 'Multilingual' && task.language !== 'None' ? `<div class="addon-language">${task.language} Content</div>` : ''
        const addonsScoreFaded = !task.ups && !task.downs ? ' addon-score-faded' : ''

        const labelsForHomeHeader = task.labels.map(el => `<span class="label label-addon-page" style="background-color: #${el.color}">${el.name}</span>`).join('')
        const labelsForHomeAddon = task.labels.map(el => `<span class="label label-small" style="background-color: #${el.color}">${el.name}</span>`).join('')
        
        const map = {
          '{home-netlify-domain}': config['netlify-domain'],
          '{addon-page-title-append}': config['meta-addon-title-append'],
          '{labels}': labelsHtml,
          '{addon-id}': addonManifest.id,
          '{addon-version}': addonManifest.version,
          '{addon-title}': addonManifest.name,
          '{addon-description}': addonManifest.description || '',
          '{addon-keywords}': keywordsForAddonPage,
          '{addon-logo}': addonManifest.logo || addonManifest.icon,
          '{addon-types}': labelsForHomeHeader,
          '{addon-types-small}': labelsForHomeAddon,
          '{addon-score}': task.score,
          '{addon-ups}': task.ups,
          '{addon-downs}': task.downs,
          '{addons-score-faded}': addonsScoreFaded,
          '{install-button}': installButton,
          '{configure-button}': configButton,
          '{comments-button}': commentsButton,
          '{addon-page}': `${slug(addonManifest.name)}.html`,
          '{issue-url}': task.issueUrl,
          '{issue-number}': task.issueNumber,
          '{repo-name}': config.author+'/'+config.repository,
          '{addon-language}': language,
          '{addon-url}': task.url,
        }

        const addonHtml = processHtml('homePageAddon', map)

        task.labels = [{ color: 'A08C80', name: '<ion-icon class="back-arrow" name="arrow-back-outline"></ion-icon> all addons' }].concat(task.labels)
        const labelsForAddonPage = task.labels.map(el => `<${'a href="https://' + config['netlify-domain'] + '/' + (el.name === '<ion-icon class="back-arrow" name="arrow-back-outline"></ion-icon> all addons' ? '' : '?label=' + el.name.split(' ').join('-')) + '"'} class="label label-addon-page" style="background-color: #${el.color}">${el.name}</a>`).join('')
        map['{addon-types-links}'] = labelsForAddonPage
        
        const parsedAddonPage = processHtml('addonPage', map)

        console.log('creating page for addon: ' + addonManifest.name)
        fs.writeFileSync(`${dir}/${slug(addonManifest.name)}.html`, parsedAddonPage)
        task.labels.shift() // remove "all addons" prefix from labels
        listHtml.push(addonHtml)
        cb()
      }
      const findCachedManifest = () => {
        let cachedManifest
        cached.catalog.some(oldAddon => {
          if (oldAddon.transportUrl === task.url) {
            if (!cached.prefer)
              console.log('warning: using cached manifest for: ' + task.name)
            cachedManifest = oldAddon.manifest
            return true
          }
        })
        return cachedManifest
      }
      if (cached.prefer) {
        const cachedManifest = findCachedManifest()
        if (cachedManifest) {
          processManifest(cachedManifest, task)
          return
        }
      }
      needle.get(task.url, config.needle, (err, resp, body) => {
        let addonManifest
        let rip
        if ((body || {}).id && body.version) {
          addonManifest = body
          cached.lastReached[task.url] = Date.now()
        } else if (cached.catalog.length) {
          if (cached.lastReached[task.url] && Date.now() - cached.lastReached[task.url] > config['maximum-unreachable']) {
            rip = true
          } else {
            addonManifest = findCachedManifest()
          }
        }
        processManifest(addonManifest, task, rip)
      })
    }, 1)

    queue.drain = () => {
      if (config.DISCORD_WEBHOOK && newAddons.length)
        sendDiscordMessage(newAddons.filter(addon => !config.blockedAnnouncers.includes(addon.url)))
      console.log('copying resources (styles, js, images)')
      fs.readdirSync('./resources').forEach(file => {
        const filePath = `./resources/${file}`
        if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
          console.log(`copied ${file} resource`)
          fs.copyFileSync(filePath, `${dir}/${file}`)
        }
      })
      fs.copyFileSync('./resources/styles.css', `${dir}/styles.css`)

      const manifest = {
        id: 'community.stremio.stremio-addons-list',
        version: '1.0.0',
        name: 'Stremio Community Addons List',
        description: 'Stremio Community Addons List',
        types: ["movie", "series", "channel", "tv"],
        resources: ['addon_catalog'],
        catalogs: [],
        addonCatalogs: [{
          type: 'all',
          id: 'community',
          name: 'Community (External)',
        }],
      };

      console.log('creating manifest file')
      fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest))

      console.log('creating addon_catalog file')
      fs.mkdirSync(`${dir}/addon_catalog/all`, { recursive: true });
      fs.writeFileSync(`${dir}/addon_catalog/all/community.json`, JSON.stringify({
        addons: addons_collection
      }))

      console.log('creating addons catalog json file')
      fs.writeFileSync(`${dir}/catalog.json`, JSON.stringify(addons_collection))

      console.log('creating last reached json file')
      fs.writeFileSync(`${dir}/lastReached.json`, JSON.stringify(cached.lastReached))

      console.log('creating home page')
      // move "misc" label to end of list
      const miscLabelIndex = all_labels.findIndex(label => label.name === 'misc')
      if (miscLabelIndex > -1)
        all_labels.push(all_labels.splice(miscLabelIndex, 1)[0])
      const map = {
        '{home-keywords}': config['meta-keywords'],
        '{home-page-title}': config['page-title'],
        '{home-meta-title}': config['meta-title'],
        '{home-netlify-domain}': config['netlify-domain'],
        '{home-favicon}': config['meta-favicon'],
        '{home-description}': config['meta-description'],
        '{repo-name}': config.author+'/'+config.repository,
        '{labels-list}': all_labels.filter(label => label.name !== "approved").map((el, ij) => `<span class="label${!ij ? ' selected' : ''}" style="background-color: #${el.color}">${el.name}</span>`).join(''),
        '{addons-list}': listHtml.join(''),
      }
      const homePage = processHtml('homePage', map)
      fs.writeFileSync(`${dir}/index.html`, homePage)
      if (!cached.prefer) {
        console.log('saving timestamp of last update to json')
        fs.writeFileSync(`${dir}/lastUpdate.json`, JSON.stringify({ time: Date.now() }))
      } else {
        console.log('persisting last known update time because cache was preferred')
        fs.writeFileSync(`${dir}/lastUpdate.json`, JSON.stringify({ time: cached.time }))
      }
    }

    addons.sort((a,b) => { return a.score > b.score ? -1 : 1 })

    addons.forEach(addon => queue.push(addon))

  }).catch(e => console.error(e))
}).catch(e => console.error(e))
