const { Agent } = require('https');
const axios = require('axios').default;

let tokens = new Object();
let headers = new Object();

let items = new Object();

let ssid_cookie = new String();
let client_version = new String();

const ciphers = [
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256'
];



const agent = new Agent({ ciphers: ciphers.join(':'), honorCipherOrder: true,maxVersion: "TLSv1.3", minVersion: 'TLSv1.2' });


const parseUrl = (uri) => {
    let url = new URL(uri)
    let params = new URLSearchParams(url.hash.substring(1))
    let access_token = params.get('access_token')
    let id_token = params.get('id_token')
    let expires_in = parseInt(params.get('expires_in'));

    return { access_token, id_token, expires_in };
}

const client_platform = {
    platformType: "PC",
    platformOS: "Windows",
    platformOSVersion: "10.0.19043.1.256.64bit",
    platformChipset: "Unknown"
};

const makeHeaders = () => {
    headers = {
        Authorization: `Bearer ${tokens.access_token}`,
        'X-Riot-Entitlements-JWT': tokens.entitlements_token,
        'X-Riot-ClientVersion': client_version,
        'X-Riot-ClientPlatform': Buffer.from(JSON.stringify(client_platform)).toString('base64'),
    }
}

const setupReauth = async () => {
    // access token -> every 1h | id token -> every 24h
    setInterval(async () => {
        try {
            const access_tokens = await axios.post('https://auth.riotgames.com/api/v1/authorization', {
                client_id: "play-valorant-web-prod",
                nonce: 1,
                redirect_uri: "https://playvalorant.com/opt_in",
                response_type: "token id_token",
                scope: "account openid"
            }, { 
                headers: {
                    Cookie: ssid_cookie,
                    'User-Agent': 'RiotClient/43.0.1.4195386.4190634 rso-auth (Windows; 10;;Professional, x64)'
                },
                httpsAgent: agent
            });

            ssid_cookie = access_tokens.headers['set-cookie'].find(elem => /^ssid/.test(elem));

            tokens = { ...tokens, ...parseUrl(access_tokens.data.response.parameters.uri) };
            makeHeaders();
        } catch (err) {
            console.trace(err)
        }
    // reauth 5 min early as then there is no downtime
    }, (tokens.expires_in - 300) * 1000);
}

const GetStore = async (puuid) => {
    try {
        makeHeaders();
        const get_store = await axios.get('https://pd.na.a.pvp.net/store/v2/storefront/'+puuid, { 
            headers: headers,
            httpsAgent: agent
        });
        const datax = get_store.data;
        const skin = datax.SkinsPanelLayout;
        const item = skin.SingleItemOffers;
        const timeR = skin.SingleItemOffersRemainingDurationInSeconds;
        const hasil= [];
        for (let i = 0, len = item.length; i < len; i++) {
            const uuid = item[i];
            const skin_url = await axios.get('https://valorant-api.com/v1/weapons/skinlevels/'+uuid);
            const datax = skin_url.data.data;
            const data = {"uuid":datax.uuid,"DisplayName":datax.displayName,"ImgUrl":datax.displayIcon};
            hasil.push(data);    
        }
        items = {"DailySkin": {"List_Skin": hasil,"Time": timeR}};
        return(items);
    } catch (err) {
        console.trace(err)
    }
}

(async function () {
    const cookie = (await axios.post('https://auth.riotgames.com/api/v1/authorization', {
        client_id: "play-valorant-web-prod",
        nonce: 1,
        redirect_uri: "https://playvalorant.com/opt_in",
        response_type: "token id_token",
        scope: "account openid"
    }, {
        headers: {
            'User-Agent': 'RiotClient/43.0.1.4195386.4190634 rso-auth (Windows; 10;;Professional, x64)'
        },
        httpsAgent: agent
    })).headers['set-cookie'].find(elem => /^asid/.test(elem));

    client_version = (await axios.get('https://valorant-api.com/v1/version')).data.data.riotClientVersion;

    const access_tokens = await axios.put('https://auth.riotgames.com/api/v1/authorization', {
        type: "auth",
        username: "username",
        password: "password"
    }, {
        headers: {
            Cookie: cookie,
            'User-Agent': 'RiotClient/43.0.1.4195386.4190634 rso-auth (Windows; 10;;Professional, x64)'
        },
        httpsAgent: agent
    });
    if (access_tokens.data.error) {
        console.log("Good day")
      }else {
        ssid_cookie = access_tokens.headers['set-cookie'].find(elem => /^ssid/.test(elem));

        tokens = parseUrl(access_tokens.data.response.parameters.uri);
    
        tokens.entitlements_token = (await axios.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, { headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        }})).data.entitlements_token;
        const puuid = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64').toString()).sub;
        makeHeaders();
        setupReauth();
        let userToken = await GetStore(puuid);
        console.log(userToken.DailySkin.List_Skin);

        
    }

    
})();
