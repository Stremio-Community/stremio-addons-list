// we get the old files from the deployment
const needle = require('needle')
const config = require('../config')

function isObject(obj) {
  return typeof obj === 'object' &&
    !Array.isArray(obj) &&
    obj !== null
}

const getCached = () => {
  return new Promise((resolve, reject) => {
    const cached = { catalog: [] }
    needle.get(`https://${config['netlify-domain']}/lastUpdate.json`, config.needle, (err, resp, body) => {
      // if an update was done less than 12h ago, then prefer updating from cache
      if ((body || {}).time) {
        cached.time = body.time
        console.log('got last known website update time')
      } else {
        console.log('warning: could not get last update time')
      }

      needle.get(`https://${config['netlify-domain']}/catalog.json`, config.needle, (err, resp, body) => {
        if ((body || []).length && body[0].transportUrl && body[0].transportName && body[0].manifest) {
          console.log('loaded old addon catalog')
          cached.catalog = body
        } else {
          console.log('warning: could not load old addon catalog')
        }

        needle.get(`https://${config['netlify-domain']}/lastReached.json`, config.needle, (err, resp, body) => {
          if (body && isObject(body) && Object.keys(body).length) {
            console.log('loaded last reached data')
            cached.lastReached = body
          } else {
            cached.lastReached = {}
            console.log('warning: could not load last reached data')
          }
          resolve(cached)
        })
      })
    })
  })
}

module.exports = getCached
