import React, { useEffect, useState } from "react";
import { Alert, Button, Col, FormControl, ProgressBar, Row } from "react-bootstrap";
import "./Device.scss";
import confirmBool, { confirmModal } from "../Confirm";
import { DeviceId, DeviceInfo, DeviceType, FirmwareUpgradeDeviceRequest, FirmwareUpgradeDeviceResponse, GrappleDeviceRequest, GrappleDeviceResponse, GrappleModelId, LightReleaseResponse } from "../schema";
import Bug from "../Bug";
import { rpc } from "../rpc";
import { useToasts } from "../toasts";
import LaserCanComponent from "./LaserCan";
import OldVersionDevice from "./OldVersionDevice";
import FlexiCanComponent from "./FlexiCan";
import MitocandriaComponent from "./Mitocandria";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle, faMagicWandSparkles } from "@fortawesome/free-solid-svg-icons";

type FactoryFunc = (info: DeviceInfo, invoke: (msg: any) => Promise<any>) => any;
const FACTORIES: { [k: string]: FactoryFunc } = {
  "OldVersionDevice": (info, invoke) => <OldVersionDevice info={info} invoke={invoke} />,
  "GrappleFirmwareUpgrade": (info, invoke) => <FirmwareUpdateComponent info={info} invoke={invoke} />,
  "LaserCAN": (info, invoke) => <LaserCanComponent info={info} invoke={invoke} />,
  "MitoCANdria": (info, invoke) => <MitocandriaComponent info={info} invoke={invoke} />,
  "FlexiCAN": (info, invoke) => <FlexiCanComponent info={info} invoke={invoke} />
};
const getFactory = (device_class: string) => FACTORIES[device_class]

export const renderDeviceType = (deviceType: DeviceType) => {
  if (deviceType == "RoboRIO") {
    return "NI RoboRIO"
  } else if (deviceType == "Unknown") {
    return "Unknown Device"
  } else if ("Grapple" in deviceType) {
    return deviceType.Grapple
  } else {
    return "Unknown Device"
  }
}

type DeviceComponentProps = {
  id: DeviceId, 
  info: DeviceInfo,
  device_class: string,
  invoke: (msg: any) => Promise<any>
}

export function DeviceComponent(props: DeviceComponentProps) {
  const { id, info, device_class, invoke } = props;
  let factory = getFactory(device_class);

  return <React.Fragment>
    {
      info.is_dfu ? <h3> { renderDeviceType(info.device_type) } { info.device_id != undefined && `#${info.device_id}` } <span className="text-orange">FIRMWARE UPDATE</span> </h3>
      : <h3> { renderDeviceType(info.device_type) } { info.device_id != undefined && `#${info.device_id}` } { info.name != undefined && `(${info.name})` } </h3>
    }

    {
      (info.serial != undefined || info.firmware_version != undefined) && (
        <p className="text-muted">
          { info.serial != undefined && `Serial: 0x${info.serial.toString(16)}` } &nbsp;
          { info.firmware_version != undefined && info.is_dfu ? `Bootloader: ${info.firmware_version}` : `Firmware: ${info.firmware_version}` }
        </p>
      )
    }

    {
      factory !== undefined ? factory(info, invoke)
        : <Bug specifics={`Unknown Device Type: ${JSON.stringify(info.device_type)} (${device_class})`} />
    }
  </React.Fragment>
}

type GrappleDeviceHeaderComponentProps = {
  info: DeviceInfo,
  invoke: (msg: GrappleDeviceRequest) => Promise<GrappleDeviceResponse>,
  start_dfu?: () => any,
  update_details?: LightReleaseResponse | null
}

export function GrappleDeviceHeaderComponent(props: GrappleDeviceHeaderComponentProps) {
  const { info, invoke, start_dfu, update_details } = props;
  const { addError } = useToasts();

  const changeId = async (serial: number, name: string, currentId: number) => {
    let newId = Number(await confirmModal("" + serial, {
      data: String(currentId),
      title: "Set New ID",
      okText: "Set ID",
      renderInner: (id: string, onUpdate) => <React.Fragment>
        <p> Set New ID for { name } (Serial: 0x{ serial.toString(16).toUpperCase() }) </p>
        <FormControl type="number" value={id} onChange={e => onUpdate(e.target.value)} min={0} max={0x3F - 1} step={1}/>
      </React.Fragment>
    })) || 0;

    rpc<GrappleDeviceRequest, GrappleDeviceResponse, "set_id">(invoke, "set_id", { id: newId })
      .catch(addError);
  }

  const changeName = async(serial: number, currentName: string) => {
    let newName = await confirmModal("" + serial, {
      data: currentName,
      title: "Set New Name",
      okText: "Set Name",
      renderInner: (name: string, onUpdate) => <React.Fragment>
        <p> Set New Name for { currentName } (Serial: 0x{ serial.toString(16).toUpperCase() }) </p>
        <FormControl type="text" value={name} onChange={e => onUpdate(e.target.value)} maxLength={16} />
      </React.Fragment>
    });

    if (newName.length > 16)
      addError("Name is too long!");
    else
      rpc<GrappleDeviceRequest, GrappleDeviceResponse, "set_name">(invoke, "set_name", { name: newName })
        .catch(addError);
  }

  const startFieldUpgrade = async () => {
    let do_upgrade = await confirmBool("Are you sure? Once a firmware upgrade is started, the device cannot be used until the firmware update is complete.", {
      title: "Firmware Upgrade",
      okText: "Start Firmware Upgrade",
      okVariant: "purple"
    });

    if (do_upgrade)
      start_dfu!()
  }

  return <React.Fragment>
    <Row>
      <Col>
        <Button size="sm" className="mx-1" variant="info" onClick={() => rpc<GrappleDeviceRequest, GrappleDeviceResponse, "blink">(invoke, "blink", {})}> Blink </Button>
        <Button size="sm" className="mx-1" variant="secondary" onClick={() => changeId(info.serial!, info.name!, info.device_id!)}> Change ID </Button>
        <Button size="sm" className="mx-1" variant="secondary" onClick={() => changeName(info.serial!, info.name!)}> Change Name </Button>
      </Col>
      <Col md="auto">
        {
          start_dfu && <Button size="sm" className="mx-1" variant={ update_details ? "orange" : "purple" } onClick={startFieldUpgrade}> Firmware Upgrade </Button>
        }
        <Button size="sm" className="mx-1" variant="success" onClick={() => rpc<GrappleDeviceRequest, GrappleDeviceResponse, "commit_to_eeprom">(invoke, "commit_to_eeprom", {})}> Commit Configuration </Button>
      </Col>
    </Row>
    {
      update_details && <Row className="mt-3 mb-1">
        <Col>
          <Alert variant="orange">
            <span style={{ fontSize: '1.5em' }}> <FontAwesomeIcon icon={faMagicWandSparkles} /> &nbsp; Update Available! </span>
            <br />
            <span>Version <strong>{ update_details.tag_name }</strong> is available for this device. </span>
            Download the release <a target="_blank" href={update_details.html_url}>here</a> and upgrade using the "Firmware Upgrade" button above.
          </Alert>
        </Col>
      </Row>
    }
  </React.Fragment>
}

type FirmwareUpdateComponentProps = {
  info: DeviceInfo,
  invoke: (msg: FirmwareUpgradeDeviceRequest) => Promise<FirmwareUpgradeDeviceResponse>
}

export function FirmwareUpdateComponent(props: FirmwareUpdateComponentProps) {
  const { invoke } = props;

  const [ progress, setProgress ] = useState<number | null>(null);
  const [ firmwareURL, setFirmwareURL ] = useState<string | null>(null);
  const { addError } = useToasts();
  
  useEffect(() => {
    const interval = setInterval(() => {
      rpc<FirmwareUpgradeDeviceRequest, FirmwareUpgradeDeviceResponse, "progress">(invoke, "progress", {})
        .then(setProgress)
        .catch(e => {});    // Discard, it's usually a message to say that the device is disconnected and the UI fragment just hasn't been evicted yet.
    }, 250);

    rpc<FirmwareUpgradeDeviceRequest, FirmwareUpgradeDeviceResponse, "get_firmware_url">(invoke, "get_firmware_url", {})
      .then(setFirmwareURL)
      .catch(e => {})

    return () => clearInterval(interval);
  }, [])

  const uploadFirmware = (file: Blob) => {
    const reader = new FileReader();
    reader.addEventListener("loadend", (event) => {
      rpc<FirmwareUpgradeDeviceRequest, FirmwareUpgradeDeviceResponse, "do_field_upgrade">(invoke, "do_field_upgrade", { data: Array.from(new Uint8Array((event.target!.result as ArrayBuffer))) })
        .catch(addError);
    });
    reader.readAsArrayBuffer(file);
  }

  return <React.Fragment>
    {
      progress ? <React.Fragment>
        <Row>
          <Col> <ProgressBar min={0} max={100} now={progress} variant="purple" animated striped /> </Col>
        </Row>
      </React.Fragment> : <React.Fragment>
        { firmwareURL && <Row className="mb-2">
          <Col className="text-muted">
            <FontAwesomeIcon icon={faInfoCircle} /> &nbsp; You can download new firmware for this device <a target="_blank" href={firmwareURL}>here.</a>
          </Col>
        </Row> }
        <Row>
          <Col>
            <FormControl type="file" accept=".grplfw,.grplbndl" onChange={e => uploadFirmware((e.target as any).files[0])} />
          </Col>
        </Row>
      </React.Fragment>
    }
  </React.Fragment>
}