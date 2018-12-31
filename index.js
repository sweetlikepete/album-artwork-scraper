

const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs-extra");
const args = require("yargs").argv;
const batchSize = 100;

let results = [];
let id = 10000;

if(!args.dest){

    console.log("Please specify a folder to save images to with the --dest option");

    process.exit();

}

const dest = path.resolve(args.dest);


const get = async function(){

    const promises = Array.apply(null, Array(batchSize)).map(async (val, index) => {

        let res = null;
        let body = null;
        let json = null;
        let aid = id + index;

        const albumsFolder = path.join(dest, `data/albums/${ String(aid).substring(0, 3) }`);
        const albumsFile = path.join(albumsFolder, `${ aid }.json`);
        const albumsFileExists = await fs.exists(albumsFile);

        let albums = [];

        if(!albumsFileExists){

            try{

                res = await fetch(`https://itunes.apple.com/lookup?id=${ aid }&entity=album`);

            }catch(err){

                console.error(`${ aid }: Connection error`);

            }

            if(res){

                try{

                    body = await res.text();

                }catch(err){

                    console.error(`${ aid }: Empty response`);

                }

            }

            if(body){

                try{

                    json = JSON.parse(body);

                }catch(err){

                    console.error(`${ aid }: JSON parse error`);

                }

            }

            if(json){

                if(json.results){

                    albums = json.results.filter((item) => item.wrapperType === "collection");

                }

            }

        }else{

            const rawAlbums = await fs.readFile(albumsFile);

            albums = JSON.parse(rawAlbums);

        }

        if(albums && albums.length){

            await Promise.all(albums.map(async (album) => {

                const cid = album.collectionId;
                const albumFolder = path.join(dest, `data/album/${ String(cid).substring(0, 3) }`);
                const albumFile = path.join(albumFolder, `${ cid }.json`);
                const albumFileExists = await fs.exists(albumFile);

                if(!albumFileExists){

                    await fs.ensureDir(albumFolder);
                    await fs.writeFile(albumFile, JSON.stringify(album, null, 4));

                }

                const artworkUrl = album.artworkUrl100.replace("100x100bb.jpg", "500x500bb.jpg");

                const imageFolder = path.join(dest, `images/album/${ String(cid).substring(0, 3) }`);
                const imageFile = path.join(imageFolder, `${ cid }.jpg`);
                const imageFileExists = await fs.exists(imageFile);

                if(!imageFileExists){

                    await fs.ensureDir(imageFolder);

                    const res = await fetch(artworkUrl);

                    await new Promise((resolve, reject) => {

                        const fileStream = fs.createWriteStream(imageFile, {
                            autoClose: true
                        });

                        res.body.pipe(fileStream);

                        res.body.on("error", (err) => {

                            console.error(`Download failed: ${ aid } - ${ cid }`);

                            fileStream.close();

                            reject(err);

                        });

                        fileStream.on("finish", function() {

                            console.log(`Downloaded artwork: ${ aid } - ${ cid }`);

                            fileStream.close();

                            resolve();

                        });

                    });

                }else{

                    console.log(`Already Downloaded artwork: ${ aid } - ${ cid }`);

                }

            }));

        }

        await fs.ensureDir(albumsFolder);
        await fs.writeFile(albumsFile, JSON.stringify(albums, null, 4));

        return albums;

    });

    await Promise.all(promises);

    id += batchSize;

    get();

}

get();
