#![allow(non_camel_case_types, non_snake_case)]

use std::io::Cursor;

use async_compression::{Level, tokio::bufread::BzDecoder, tokio::bufread::ZstdDecoder, tokio::write::BzEncoder, tokio::write::ZstdEncoder};
use napi::bindgen_prelude::{Buffer, Error, Result, Status};
use napi_derive::napi;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

macro_rules! performAction {
    ($decoder: path, $input: expr) => {
        {
            let input: &[u8] = $input.as_ref();
            let mut output = Vec::new();
            let mut decoder = $decoder(Cursor::new(input));
            decoder.read_to_end(&mut output).await?;
            Ok(Buffer::from(output))
        }
    };
    ($encoder: path, $input: expr, $level: expr) => {
        {
            let input: &[u8] = $input.as_ref();
            let mut encoder = $encoder(Vec::new(), Level::Precise($level));
            encoder.write_all(input).await?;
            encoder.shutdown().await?;
            Ok(Buffer::from(encoder.into_inner()))
        }
    };
}

#[napi(ts_args_type = "compressionType: 'bzip2' | 'zstd', input: Buffer")]
pub async fn decompress(compressionType: String, input: Buffer) -> Result<Buffer> {
    match compressionType.as_str() {
        "bzip2" => performAction!(BzDecoder::new, input),
        "zstd" => performAction!(ZstdDecoder::new, input),
        _ => Err(Error::new(Status::InvalidArg, "Compression type".to_owned())),
    }
}

#[napi(ts_args_type = "compressionType: 'bzip2' | 'zstd', input: Buffer, level: number")]
pub async fn compress(compressionType: String, input: Buffer, level: u32) -> Result<Buffer> {
    match compressionType.as_str() {
        "bzip2" => performAction!(BzEncoder::with_quality, input, level),
        "zstd" => performAction!(ZstdEncoder::with_quality, input, level),
        _ => Err(Error::new(Status::InvalidArg, "Compression type".to_owned())),
    }
}
