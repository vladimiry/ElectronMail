#![deny(clippy::all)]

use std::io::Cursor;

use async_compression::{tokio::bufread::ZstdDecoder, tokio::write::ZstdEncoder, Level};
use napi::bindgen_prelude::{Buffer, Result};
use napi_derive::napi;
use tokio::io::{AsyncReadExt, AsyncWriteExt}; // write_all + read_to_end calls

const DEFAULT_COMPRESSION_LEVEL: u32 = 7;

#[napi]
pub async fn compress(input: Buffer, level: Option<u32>) -> Result<Buffer> {
    let input: &[u8] = input.as_ref();
    let mut output = Vec::new();
    let compression_level = Level::Precise(level.unwrap_or(DEFAULT_COMPRESSION_LEVEL));
    let mut encoder = ZstdEncoder::with_quality(&mut output, compression_level);
    encoder.write_all(input).await.unwrap();
    encoder.shutdown().await?;
    Ok(Buffer::from(output))
}

#[napi]
pub async fn decompress(input: Buffer) -> Result<Buffer> {
    let input: &[u8] = input.as_ref();
    let mut output = Vec::new();
    let mut decoder = ZstdDecoder::new(Cursor::new(input));
    decoder.read_to_end(&mut output).await?;
    Ok(Buffer::from(output))
}
