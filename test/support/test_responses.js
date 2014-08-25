module.exports = {
    simple: {
        success: {
            status: 200,
            responseText: '{"foo": "bar"}'
        },
        server_error: {
            status: 500,
            responseText: '{"error": "Oh noes!"}'
        }
    },
    stations: {
        success: {
            url: '/stations.json',
            status: 200,
            responseText: JSON.stringify(
                [
                    {
                        "id" : 4,
                        "latest_observation" : {
                            "observation" : {
                                "cardinal" : "E",
                                "created_at" : "2014-04-17T08:11:18Z",
                                "direction" : 90.0,
                                "id" : 45083,
                                "max_wind_speed" : 0.69999999999999996,
                                "min_wind_speed" : 0.0,
                                "speed" : 0.10000000000000001,
                                "station_id" : 4,
                                "tstamp" : 1397722278
                            }
                        },
                        "latitude" : 63.39564,
                        "longitude" : 13.073,
                        "name" : "Camp Åre",
                        "offline" : true,
                        "path" : "/stations/camp-are",
                        "slug" : "camp-are",
                        "url" : "http://www.blast.nu/stations/camp-are"
                    },
                    {
                        "id" : 2,
                        "latest_observation" : {
                            "observation" : {
                                "cardinal" : "S",
                                "created_at" : "2014-06-08T00:50:35Z",
                                "direction" : 163.0,
                                "id" : 54084,
                                "max_wind_speed" : 1.3,
                                "min_wind_speed" : 0.59999999999999998,
                                "speed" : 1.1000000000000001,
                                "station_id" : 2,
                                "tstamp" : 1402188635
                            }
                        },
                        "latitude" : 57.484186999999999,
                        "longitude" : 18.126104000000002,
                        "name" : "Gotlands Surfcenter",
                        "offline" : false,
                        "path" : "/stations/gsc",
                        "slug" : "gsc",
                        "url" : "http://www.blast.nu/stations/gsc"
                    },
                    {
                        "id" : 3,
                        "latest_observation" : {
                            "observation" : {
                                "cardinal" : "SE",
                                "created_at" : "2014-03-13T22:41:03Z",
                                "direction" : 136.0,
                                "id" : 39225,
                                "max_wind_speed" : 0.0,
                                "min_wind_speed" : 0.0,
                                "speed" : 0.0,
                                "station_id" : 3,
                                "tstamp" : 1394750463
                            }
                        },
                        "latitude" : 63.165050000000001,
                        "longitude" : 14.61619,
                        "name" : "Storsjön",
                        "offline" : true,
                        "path" : "/stations/storsjon",
                        "slug" : "storsjon",
                        "url" : "http://www.blast.nu/stations/storsjon"
                    }
                ]
            )
        }
    },
    observations: {
        success: {
            url: '/stations/*/observations.json',
            status: 200,
            responseText: [
                {
                    "id": 52677,
                    "station_id": 2,
                    "speed": 4.9,
                    "direction": 39,
                    "cardinal": "NE",
                    "max_wind_speed": 5.7,
                    "min_wind_speed": 3.8,
                    "created_at": "2014-06-03T01:14:17Z",
                    "tstamp": 1401758057
                },
                {
                    "id": 52678,
                    "station_id": 2,
                    "speed": 4.1,
                    "direction": 94,
                    "cardinal": "E",
                    "max_wind_speed": 4.7,
                    "min_wind_speed": 3.3,
                    "created_at": "2014-06-03T01:19:21Z",
                    "tstamp": 1401758361
                }
            ]
        }
    },
    station: {
        success: {
            url: '/stations/*.json',
            status: 200,
            responseText: {
                "id" : 2,
                "latest_observation" : {
                    "observation" : {
                        "cardinal" : "S",
                        "created_at" : "2014-06-08T00:45:27Z",
                        "direction" : 178.0,
                        "id" : 54083,
                        "max_wind_speed" : 1.8,
                        "min_wind_speed" : 1.1000000000000001,
                        "speed" : 1.5,
                        "station_id" : 2,
                        "tstamp" : 1402188327
                    }
                },
                "latitude" : 57.484186999999999,
                "longitude" : 18.126104000000002,
                "name" : "Gotlands Surfcenter",
                "offline" : false,
                "path" : "/stations/gsc",
                "slug" : "gsc",
                "url" : "http://www.blast.nu/stations/gsc"
            }
        }
    }
};