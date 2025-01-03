module.exports = {
	// for repo: danamag/stremio-addons-list
	"repository": "stremio-addons-list",
	"author": "danamag",
	"netlify-domain": "stremio-addons.netlify.app",
	"page-title": "Stremio Community Addons List",
	// images are located in ./resources/
	"meta-favicon": "stremio_community_logo.png",
	"meta-title": "Stremio Addons - Community List",
	"meta-description": "Stremio community currated addons list, find the best Stremio addons here.",
	"meta-keywords": "stremio addons, no streams, addons, torrentio, piratebay, addons list, what addons",
	// for the addon page, {} is replaced with the addon name
	"addon-keywords": "{}, {} down, {} down or just me, {} site down, {} not working, {} not found, stremio addons, addons list",
	// this gets appended to the title, ex: "TMDB Addon - Stremio Addons"
	"meta-addon-title-append": "Stremio Addons",
	// for 12h since last full update, it will prefer cached manifests over retrieving new ones
	"prefer-cached-for": 12 * 60 * 60 * 1000,
	// when min score is reached the addon will be removed / issue closed
	"minimum-score": -10,
	// when an addon is unreachable for 10 days, remove the submission
	"maximum-unreachable": 10 * 24 * 60 * 60 * 1000,
	// optional label id, if available it will add a label when closing an issue due to various reasons
	// you can only get the label id through the github graphql api
	"label-id-for-low-score": "LA_kwDOFVUyTM8AAAABGbO_Bw", // "very low score"
	"label-id-for-duplicate": "LA_kwDOFVUyTM8AAAABP8VfgA", // "duplicate"
	"label-id-for-invalid": "LA_kwDOFVUyTM8AAAABP8VmVQ", // "invalid addon url"
	"label-id-for-inactive": "LA_kwDOFVUyTM8AAAABP8VsIw", // "addon inactive"
	"label-id-for-unreachable": "LA_kwDOFVUyTM8AAAABP8Zl7g", // "addon manifest unreachable"
	"label-id-approved": "LA_kwDOFVUyTM8AAAABwTaXuQ", // "approved"
	"label-id-pending-approval": "LA_kwDOFVUyTM8AAAABwUPwvQ", // "pending approval"
	// sane timeouts for needle so it doesn't get stuck in a request
	"needle": { "open_timeout": 5000, "response_timeout": 5000, "read_timeout": 5000, "follow_max": 5 },
	// output folder for build
	"build-dir": "./out"
}
