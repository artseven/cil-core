'use strict';

const {describe, it} = require('mocha');
const {assert} = require('chai');
const sinon = require('sinon').createSandbox();
const debug = require('debug')('application:test');

const factory = require('./testFactory');
const {pseudoRandomBuffer} = require('./testUtil');

const createGenezis = (factory, utxoHash) => {
    const patch = new factory.PatchDB();
    const keyPair = factory.Crypto.createKeyPair();
    const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

    // create "genezis"
    const coins = new factory.Coins(100000, buffAddress);
    patch.createCoins(utxoHash, 12, coins);
    patch.createCoins(utxoHash, 0, coins);
    patch.createCoins(utxoHash, 80, coins);

    const storage = new factory.Storage({});
    storage.applyPatch(patch);

    return {storage, keyPair};
};

describe('Application layer', () => {
    before(async function() {
        this.timeout(15000);
        await factory.asyncLoad();
    });

    after(async function() {
        this.timeout(15000);
    });

    it('should create instance', async () => {
        new factory.Application();
    });

    it('should process TX', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenezis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addInput(utxoHash, 0);
        tx.addInput(utxoHash, 80);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);
        tx.sign(1, keyPair.privateKey);
        tx.sign(2, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const utxo = await storage.getUtxo(utxoHash);
        const mapUtxos = {[utxoHash]: utxo};

        await app.processTx(tx, mapUtxos);

    });

    it('should throw (wrong UTXO index -> no coins)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenezis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 17);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const utxo = await storage.getUtxo(utxoHash);
        const mapUtxos = {[utxoHash]: utxo};

        try {
            await app.processTx(tx, mapUtxos);
        } catch (e) {
            debug(e);
            assert.equal(e.message, `Output #17 of Tx ${utxoHash} already spent!`);
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should throw (not enough moneys)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenezis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addReceiver(100000, buffAddress);
        tx.sign(0, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const utxo = await storage.getUtxo(utxoHash);
        const mapUtxos = {[utxoHash]: utxo};

        try {
            await app.processTx(tx, mapUtxos);
        } catch (e) {
            debug(e);
            assert.equal(e.message, `Tx ${tx.hash()} fee 0 too small!`);
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should throw (bad claim)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenezis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);
        const anotherKeyPair = factory.Crypto.createKeyPair();

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addReceiver(100000, buffAddress);
        tx.sign(0, anotherKeyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const utxo = await storage.getUtxo(utxoHash);
        const mapUtxos = {[utxoHash]: utxo};

        try {
            await app.processTx(tx, mapUtxos);
        } catch (e) {
            debug(e);
            assert.equal(e.message, 'Claim failed!');
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should process TX from GENESIS block', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenezis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);
        const anotherKeyPair = factory.Crypto.createKeyPair();

        // create tx
        const tx = new factory.Transaction();
        tx.addReceiver(100000, buffAddress);
        tx.sign(0, anotherKeyPair.privateKey);

        const patch = new factory.PatchDB();

        await app.processTx(tx, undefined, patch, true);

        assert.equal(patch.getCoinsToAdd().size, 1);
        const utxo = patch.getCoinsToAdd().get(tx.hash());
        assert.isOk(utxo);
        assert.isNotOk(utxo.isEmpty());
    });

});