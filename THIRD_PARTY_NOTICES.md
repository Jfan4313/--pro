# Third-party notices

## FunASR and speech models

This project can connect to a separately operated FunASR service for Chinese
speech recognition. FunASR source code is maintained by ModelScope:

- Source: https://github.com/modelscope/FunASR
- Model license: https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE

Configured models are Paraformer-zh (primary), FSMN-VAD and CT-Punc, with
SenseVoiceSmall as an optional fallback. Model artifacts are downloaded and
stored outside application releases under `/var/lib/zhijian-asr/models`.
