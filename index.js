

const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs-extra");
const args = require("yargs").argv;

const dest = path.resolve(args.dest);
const requestBatchSize = 100;
const artistIdBatchSize = 10;
const idFolder = dest;
const idFile = path.join(idFolder, "id.json");

let id = 10000;

if(fs.existsSync(idFile)){

    const rawId = fs.readFileSync(idFile);

    id = JSON.parse(rawId).id;

}

if(!args.dest){

    console.log("Please specify a folder to save images to with the --dest option");

    process.exit();

}

const ensureDir = async function(dir){

    // When multi-threaded, this sometimes fails when the directory already exists
    try{

        await fs.ensureDir(dir);

    }catch(err){}

};

const get = async function(){

    const promises = Array.apply(null, Array(requestBatchSize)).map(async (val, index) => {

        const idArr = Array.apply(null, Array(artistIdBatchSize)).map((val, idIndex) => id + (index * artistIdBatchSize) + idIndex);
        const idStr = idArr.join(",");
        const idTag = `${ idArr[0] }-${ idArr[artistIdBatchSize - 1] }`

        let res = null;
        let body = null;
        let json = null;
        let albums = [];

        try{

            res = await fetch(`https://itunes.apple.com/lookup?id=${ idStr }&entity=album`);

        }catch(err){

            console.error(`${ idTag }: Connection error`);

        }

        if(res){

            try{

                body = await res.text();

            }catch(err){

                console.error(`${ idTag }: Empty response`);

            }

        }

        if(body){

            try{

                json = JSON.parse(body);

            }catch(err){

                console.error(`${ idTag }: JSON parse error`);

            }

        }

        if(json){

            if(json.results){

                albums = json.results.filter((item) => item.wrapperType === "collection");

            }

        }

        if(albums && albums.length){

            await Promise.all(albums.map(async (album) => {

                const cid = album.collectionId;
                const albumFolder = path.join(dest, `data/album/${ String(cid).substring(0, 3) }`);
                const albumFile = path.join(albumFolder, `${ cid }.json`);
                const albumFileExists = await fs.exists(albumFile);

                if(!albumFileExists){

                    await ensureDir(albumFolder);
                    await fs.writeFile(albumFile, JSON.stringify(album, null, 4));

                }

                const artworkUrl = album.artworkUrl100.replace("100x100bb.jpg", "500x500bb.jpg");

                const imageFolder = path.join(dest, `images/album/${ String(cid).substring(0, 3) }`);
                const imageFile = path.join(imageFolder, `${ cid }.jpg`);
                const imageFileExists = await fs.exists(imageFile);

                if(!imageFileExists){

                    await ensureDir(imageFolder);

                    const res = await fetch(artworkUrl);

                    await new Promise((resolve, reject) => {

                        const fileStream = fs.createWriteStream(imageFile, {
                            autoClose: true
                        });

                        res.body.pipe(fileStream);

                        res.body.on("error", (err) => {

                            console.error(`${ idTag } - Download failed - ${ cid }`);

                            fileStream.close();

                            reject(err);

                        });

                        fileStream.on("finish", function() {

                            console.log(`${ idTag } - Downloaded artwork - ${ cid }`);

                            fileStream.close();

                            resolve();

                        });

                    });

                }else{

                    console.log(`${ idTag } - Already Downloaded artwork - ${ cid }`);

                }

            }));

        }else{

            console.log(`${ idTag } - Nothing found`);

        }

    });

    await Promise.all(promises);

    id += (requestBatchSize * artistIdBatchSize);

    get();

}

get();

process.on("SIGINT", async () => {
      
    await ensureDir(idFolder);
    await fs.writeFile(idFile, JSON.stringify({
        id: id - (requestBatchSize * artistIdBatchSize)
    }, null, 4));

    process.exit();

});