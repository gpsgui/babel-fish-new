import React from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as Permissions from 'expo-permissions';
import * as FileSystem from 'expo-file-system';
import init from 'react_native_mqtt';
import { FontAwesome } from '@expo/vector-icons';
import {
  StyleSheet,
  Text, 
  View,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  AsyncStorage,
  Switch,
  Picker,
  ScrollView,
  Alert
} from 'react-native';

init({
  size: 10000,
  storageBackend: AsyncStorage,
  defaultExpires: 1000 * 3600 * 24,
  enableCache: true,
  reconnect: true,
  sync : {
  }
});

const babelConfig = {
  sendTopic : 'App2',
  getTopic: 'App1'
}

const languageTable = {
  pt : {
    googleSpeechCode : 'pt-BR',
    googleTranslationCode : 'pt'
  },
  en : {
    googleSpeechCode : 'en-US',
    googleTranslationCode : 'en'
  },
  es : {
    googleSpeechCode : 'es-ES',
    googleTranslationCode : 'es',
  },
  fr : {
    googleSpeechCode : 'fr-FR',
    googleTranslationCode : 'fr',
    speechCode: 'fr-FR'
  }
}

const recordingOptions = {
  android: {
      extension: '.3gp',
      outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_AMR_WB,
      audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AMR_WB,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 23850,
  },
  ios: {
      extension: '.wav',
      audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
  }
};
//const recordingOptions = Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY

const api_key = 'PUT_KEY_HERE';
const translationUrl = 'https://translation.googleapis.com/language/translate/v2'
const speechUrl = 'https://speech.googleapis.com/v1p1beta1/speech:recognize'



export default class App extends React.Component {

  constructor(props) {
    super(props);
    this.recording = null;
    this.state = {
        isFetching: false,
        isRecording: false,
        switchValue: false,
        history: ''
    }
    this.begin = 0;
    this.end = 0;
    this.language = 'pt';
    this.sourceText = '';
    this.targetText = '';
    global.client = null;
    global.audioConfig = {
        encoding: 'AMR_WB',
        sampleRateHertz: 16000,
        languageCode: languageTable[this.language].googleSpeechCode,
    };
  }

  componentDidMount = () => {
    global.client = new Paho.MQTT.Client('soldier.cloudmqtt.com', 38347, 'BabelFishApp2');
    global.client.onConnectionLost = this.onConnectionLost;
    global.client.onMessageArrived = this.onMessageArrived;
    global.client.connect(
      { 
        onSuccess:this.onConnect, 
        onFailure:this.onFailure, 
        useSSL: true, 
        userName : 'PUT_USERNAME_HERE',  
        password :'PUT_PASSWORD_HERE'
      }
    );
    //this.language = 'pt';
  }

  onFailure = (responseObject) => {
    console.log("falha na conexão mqtt : " + responseObject.errorMessage)
  }

  onConnect = () => {
    console.log("onConnect");
    global.client.subscribe( (this.state.switchValue ? babelConfig.sendTopic : babelConfig.getTopic ));
    console.log("subscribed to topic : " + (this.state.switchValue ? babelConfig.sendTopic : babelConfig.getTopic ))
  }

  onConnectionLost = (responseObject) => {
    if (responseObject.errorCode !== 0) {
      this.setState({ isFetching: true });
      console.log("onConnectionLost:" + responseObject.errorMessage);
      global.client.connect(
        { 
          onSuccess:this.onConnect, 
          onFailure:this.onFailure, 
          useSSL: true, 
          userName : 'PUT_USERNAME_HERE',  
          password :'PUT_PASSWORD_HERE'
        }
      );
      this.setState({ isFetching: false });
    }
  }
   
  onMessageArrived = (message) => {
    //if(message.topic === (!this.state.switchValue ? babelConfig.sendTopic : babelConfig.getTopic) ){
    this.getTranslation(message.payloadString, languageTable[this.language].googleTranslationCode)
   // }
    console.log("onMessageArrived: " + message.topic + '/' + message.payloadString);
  }

  deleteRecordingFile = async () => { 
    console.log("Deleting file");
    try {
        const info = await FileSystem.getInfoAsync(this.recording.getURI());
        await FileSystem.deleteAsync(info.uri)
    } catch(error) {
        console.log("There was an error deleting recording file", error);
    }
  }

  startRecording = async () => {
    const { status } = await Permissions.askAsync(Permissions.AUDIO_RECORDING);
    if (status !== 'granted') return;

    this.setState({ isRecording: true });
    await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        playThroughEarpieceAndroid: true,                               // IMPORTANTE
        staysActiveInBackground: true,
    });
    const recording = new Audio.Recording();

    try{
        await recording.prepareToRecordAsync(recordingOptions);
        await recording.startAsync();
    }catch (error) {
        console.log("There was an error on recording : " + error);
        this.stopRecording();
    }

    this.recording = recording;
  }

  stopRecording = async () => {
    this.setState({ isRecording: false });
    try {
      this.begin = Date.now();
      await this.recording.stopAndUnloadAsync();
    } catch (error) {
      console.log("There was an error on unloading the recorded file : " + error);
    }
  }

  resetRecording = () => {
    this.deleteRecordingFile();
    this.recording = null;
  }

  getTranscription = async () => {
    this.setState({ isFetching: true });
    try {
      // Base64 encoding for reading & writing
      const options = { encoding: FileSystem.EncodingType.Base64 };
      // Read the audio resource from it's local Uri
      var audio64 = await FileSystem.readAsStringAsync(this.recording.getURI(), options);
      console.log("dados:" + audio64);
      var requestBody = {
        config : global.audioConfig,
        audio:{
          content : audio64
        }
      };
      fetch(speechUrl + '?key=' + api_key, {
        method: 'POST', 
        body: JSON.stringify(requestBody), 
        headers:{
          'Content-Type': 'application/json'
        }
      })
      .then(res => res.json())
      .then(response => {
        console.log('Success Transcribing !! : ', JSON.stringify(response))
        // if(Object.getOwnPropertyNames(response).length === 0){
        //   Alert.alert(
        //     'Speak Louder!',
        //     '',
        //     [
        //       {text: 'OK', onPress: () => console.log('OK Pressed')},
        //     ]
        //   );
        // }else{
          this.sourceText = response.results[0].alternatives[0].transcript
          global.client.publish( (!this.state.switchValue ? babelConfig.sendTopic : babelConfig.getTopic), this.sourceText);
          this.setState(previousState => ({ history: previousState.history + '\n me : ' + this.sourceText }));
          console.log(this.state.history);
        //}
        this.setState({ isFetching: false });
      })
      .catch(error => {
        this.setState({ isFetching: false });
        console.error('Error Transcribing:', error)
      });
    } catch(error) {
        console.log('Transcription : There was an error reading file', error);
        this.setState({ isFetching: false });
        this.stopRecording();
    }
    this.resetRecording();
  }

  getTranslation = (text, targetLanguage) => {
    this.setState({ isFetching: true });
    try{
      var requestBody = {
        q: text,
        target: targetLanguage
      };
      fetch(translationUrl + '?key=' + api_key, {
        method: 'POST', 
        body: JSON.stringify(requestBody),
        headers:{
          'Content-Type': 'application/json'
        }
      }) 
      .then(res => res.json())
      .then(response => {
        this.targetText = response.data.translations[0].translatedText
        this.setState(previousState => ({ history: previousState.history + '\n they : ' + this.targetText }));
        this.speak(this.targetText)
        console.log('Success Translating: ', JSON.stringify(response))
        this.setState({ isFetching: false });
      })
      .catch(error => {
        console.error('Error Translating:', error);
        this.setState({ isFetching: false });
      });
    }
    catch(error){
      console.log("Translation : Error while fetching");
      this.setState({ isFetching: false });
    }
  }

  speak = (text) => {
    Speech.speak(text,{language: languageTable[this.language].googleTranslationCode})
  }

  handleOnPressIn = () => {
    this.startRecording();
  }

  handleOnPressOut = () => {
    this.stopRecording();
    this.getTranscription();
  }

  toggleSwitch = (value) => {
    //onValueChange of the switch this function will be called
    this.setState({switchValue: value})
    console.log("listening to : " + (value ? babelConfig.sendTopic : babelConfig.getTopic ));
    console.log("publishing to : " + (!value ? babelConfig.sendTopic : babelConfig.getTopic));
    console.log("switch value : " + value);
    global.client.subscribe( (value ? babelConfig.sendTopic : babelConfig.getTopic));
    global.client.unsubscribe( (!value ? babelConfig.sendTopic : babelConfig.getTopic ) )
    console.log("unsubscribed from topic : " + (!value ? babelConfig.sendTopic : babelConfig.getTopic))
    //state changes according to switch
    //which will result in re-render the text
 }

  render(){
    const { isRecording, isFetching } = this.state;
    return (
      <SafeAreaView style={{flex: 1}}>
        <View style={styles.container}>
          <View style={styles.containerLanguage}>
            <Text style={styles.Text}>Choose your native language :</Text>
            <Picker
              selectedValue={this.language}
              style={{height: 100, width: 150}}
              onValueChange={(itemValue, itemIndex) =>{
                this.language = itemValue;
                global.audioConfig.languageCode= languageTable[this.language].googleSpeechCode;
                console.log("nova linguagem : " + this.language);
                this.forceUpdate()
              }}
            >
              <Picker.Item label="Portuguese" value="pt" />
              <Picker.Item label="English" value="en" />
              <Picker.Item label="Français" value="fr" />
              <Picker.Item label="Espanhol" value="es" />
            </Picker>
          </View>
          <View style={styles.horizontal}>
            <Text style={styles.numberText}>Speaker {this.state.switchValue?'2':'1'}</Text>
            <Switch 
              style={{marginLeft:30}}
              onValueChange = {this.toggleSwitch}
              value = {this.state.switchValue}
            />
          </View>
          <View style={styles.containerMicrofone}>
            {isFetching && <ActivityIndicator size="large" color="#fcba03" />}
            {!isFetching && <Text style={styles.Text}>Hold for Voice Capture</Text>}
            <TouchableOpacity
              style={styles.button}
              onPressIn={this.handleOnPressIn}
              onPressOut={this.handleOnPressOut}
            >
              {isRecording &&
                <FontAwesome name="microphone" size={150} color="#fc0303" />
              }
              {!isRecording &&
                  <FontAwesome name="microphone" size={150} color="#fcba03" />
              }
            </TouchableOpacity>
          </View>
          <Text>Conversation History</Text>

          <ScrollView>
            <Text>{ this.state.history }</Text>
          </ScrollView>
          
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40
  },
  containerLanguage: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  divider : {
    flex: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fcba03',
  },
  containerMicrofone: {
    paddingTop:  20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  horizontal: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  Text: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  numberText: {
    fontSize: 20,
    fontWeight: 'bold'
  }
});
