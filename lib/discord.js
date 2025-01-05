const config = require('../config')
const slug = require('../lib/slug')
const needle = require('needle')

const discordGreeting = () => {
  const greetings = ["Hey", "Sup", "Yo", "Knock knock", "Attention", "Yesss", "Oh yeah", "Awesome", "Finally", "Arr", "Ahoy, matey", "Put that cookie down"]
  return greetings[Math.floor(Math.random()*greetings.length)]
}

const sendDiscordMessage = (addons) => {
  const payload = {
      content: `${discordGreeting()}, ${addons.length > 1 ? ' new addons' : 'a new addon'} appeared in the catalog!`,
      embeds: []
  }
  addons.forEach(addon => {
    const manifest = addon.manifest
    const addonUrl = `https://${config['netlify-domain']}/${slug(addon.name)}.html`
    const embed = {
        title: manifest.name,
        url: addonUrl,
        thumbnail: {
            url: manifest.logo,
        },
        description: manifest.description,
        color: 9001641,
        provider: {
            name: 'Install',
            url: addonUrl,
        }
    }
    const labels = addon.proposedLabels.length ? addon.proposedLabels : (addon.labels || []).map(label => label.name).filter(el => !! el)
    if ((labels || []).length)
      embed.fields = [
        {
          name: 'Type',
          value: labels.map(label => label.toLowerCase()).join(', '),
        },
      ]
    payload.embeds.push(embed)
  })
  const needleOpts = Object.assign({}, config.needle)
  needleOpts.json = true
  console.log(`sending discord message about ${addons.length} new addons`)
  needle.post(config.DISCORD_WEBHOOK, payload, needleOpts, (err, resp, body) => {
    if (!err)
      console.log(`sent discord message about ${addons.length} new addons`)
    else {
      console.log(`error when sending discord message about ${addons.length} new addons`)
      console.error(err)
    }
  })
}

module.exports = sendDiscordMessage
